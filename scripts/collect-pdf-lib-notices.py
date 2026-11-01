"""Audit the vendored pdf-lib bundle (@cantoo/pdf-lib) and reproduce its notices.

This is a maintainer helper; it never changes runtime code. Run it after
updating dist/assets/vendor/pdf-lib.min.js:

    npm pack @cantoo/pdf-lib@<version>          # in an empty directory
    python3 scripts/collect-pdf-lib-notices.py --tarball <that .tgz> --cache <empty dir>

It checks that the shipped bundle is the official npm UMD build, reads the
bundle's source map (which embeds every source file), and pins each bundled
third-party package to the published npm version whose files match byte for
byte (the fork publishes no lockfile). Downloads go to --cache and are checked
against the registry's integrity hashes. It then writes the notices in
dist/licenses/pdf-lib-dependencies/, dist/licenses/pdf-lib-dependencies.txt and
the pdf_lib record in scripts/vendor-license-provenance.json.
"""
import argparse
import base64
import hashlib
import io
import json
import re
import shutil
import subprocess
import tarfile
import urllib.request
import zlib
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--tarball', required=True, type=Path, help='the official @cantoo/pdf-lib npm tarball')
parser.add_argument('--cache', required=True, type=Path, help='directory for dependency tarballs')
args = parser.parse_args()
project = Path(__file__).resolve().parents[1]
licenses = project / 'dist/licenses'
out = licenses / 'pdf-lib-dependencies'
cache = args.cache.resolve()
cache.mkdir(parents=True, exist_ok=True)
sha256 = lambda data: hashlib.sha256(data).hexdigest()
sri = lambda data: 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode()


def npm_view(spec, field):
    result = subprocess.run(['npm', 'view', spec, field, '--json'], capture_output=True, text=True, check=True, timeout=120)
    return json.loads(result.stdout)


def members(data):
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        return {m.name.split('/', 1)[1]: archive.extractfile(m).read() for m in archive.getmembers() if m.isfile() and '/' in m.name}


def fetch(name, version):
    """The exact npm tarball of a package version, verified against the registry's integrity."""
    dist = npm_view(f'{name}@{version}', 'dist')
    path = cache / (name.replace('/', '__') + f'-{version}.tgz')
    if not path.exists():
        with urllib.request.urlopen(dist['tarball'], timeout=120) as response:
            path.write_bytes(response.read())
    data = path.read_bytes()
    assert sri(data) == dist['integrity'], f'{name}@{version}: tarball does not match the registry integrity'
    return data, dist


# The vendored bundle is the official npm UMD build.
archive = args.tarball.read_bytes()
fork = members(archive)
published = json.loads(fork['package.json'])
name, version = published['name'], published['version']
assert name == '@cantoo/pdf-lib', name
registry = npm_view(f'{name}@{version}', 'dist')
assert sri(archive) == registry['integrity'], 'The fork tarball does not match the registry integrity'
bundle = fork['dist/pdf-lib.min.js']
assert bundle == (project / 'dist/assets/vendor/pdf-lib.min.js').read_bytes(), 'dist/assets/vendor/pdf-lib.min.js differs from the npm UMD'
assert fork['LICENSE.md'] == (licenses / 'pdf-lib-MIT.txt').read_bytes(), 'Update dist/licenses/pdf-lib-MIT.txt from the package LICENSE.md'
built = npm_view(name, 'time')[version]
source_map = json.loads(fork['dist/pdf-lib.min.js.map'])
sources = dict(zip(source_map['sources'], source_map['sourcesContent']))

# First-party sources in the map are the package's own published ES build.
first_party = {path: text for path, text in sources.items() if 'node_modules' not in path}
for path, text in first_party.items():
    published_path = re.sub(r'^\.\./', '', path)
    assert fork.get(published_path, b'').decode('utf8') == text, f'Bundled source differs from the published file: {path}'

# Third-party sources: pin each package to the npm version whose files match byte for byte.
wanted = {}
for path, text in sources.items():
    match = re.search(r'node_modules/((?:@[^/]+/)?[^/]+)/(.+)$', path)
    if match:
        wanted.setdefault(match.group(1), {})[match.group(2)] = text
if out.exists():
    shutil.rmtree(out)
out.mkdir(parents=True)
records, notices = [], []
for package, files in sorted(wanted.items()):
    times = npm_view(package, 'time')
    candidates = sorted((v for v, t in times.items() if v not in ('created', 'modified') and t <= built and not re.search(r'[-+]', v)),
                        key=lambda v: times[v], reverse=True)
    found = None
    for candidate in candidates:
        data, dist = fetch(package, candidate)
        contents = members(data)
        if all(contents.get(path, b'').decode('utf8', 'replace') == text for path, text in files.items()):
            found = (candidate, data, dist, contents)
            break
    assert found, f'No published version of {package} matches the bundled sources'
    candidate, data, dist, contents = found
    meta = json.loads(contents['package.json'])
    slug = package.replace('@', '').replace('/', '-') + '-' + candidate
    dest = out / slug
    dest.mkdir()
    (dest / 'package.json').write_bytes(contents['package.json'])
    license_files = sorted(p for p in contents if '/' not in p and re.match(r'(?i)^(licen[cs]e|copying|notice)', p))
    for path in license_files:
        (dest / path).write_bytes(contents[path])
    comments, seen = [], set()
    for path in sorted(files):
        for match in re.finditer(r'/\*[\s\S]*?\*/|(?:^[ \t]*//[^\n]*(?:\n|$))+', files[path], re.M):
            comment = match.group()
            if re.search(r'copyright|licensed?\b|permission is|redistribution', comment, re.I) and comment not in seen:
                seen.add(comment)
                comments.append(f'Upstream source: {path}\n\n{comment}\n')
    if comments:
        (dest / 'SOURCE-NOTICES.txt').write_text('\n'.join(comments))
    records.append({
        'name': package, 'version': candidate, 'license': meta.get('license'), 'author': meta.get('author'),
        'contributors': meta.get('contributors'), 'repository': meta.get('repository'),
        'tarball': dist['tarball'], 'integrity': dist['integrity'], 'tarball_sha256': sha256(data),
        'bundled_files_matched': len(files), 'notice_directory': slug,
        'notice_files': [f'dist/licenses/pdf-lib-dependencies/{slug}/{p}' for p in license_files + (['SOURCE-NOTICES.txt'] if comments else [])],
    })

# Packages kept inside the fork's own source tree.
in_tree = []
for folder, slug in (('standard-fonts', 'cantoo-standard-fonts'), ('upng', 'cantoo-upng')):
    base = f'src/packages/{folder}/'
    meta = json.loads(fork[base + 'package.json'])
    dest = out / f'{slug}-{version}'
    dest.mkdir()
    (dest / 'package.json').write_bytes(fork[base + 'package.json'])
    copied = []
    for path in sorted(p for p in fork if p.startswith(base) and re.match(r'(?i)^(licen[cs]e|copying|notice)', p[len(base):]) and '/' not in p[len(base):]):
        (dest / path[len(base):]).write_bytes(fork[path])
        copied.append(path[len(base):])
    in_tree.append({'source': base.rstrip('/'), 'name': meta.get('name'), 'license': meta.get('license'),
                    'author': meta.get('author'), 'notice_directory': dest.name,
                    'notice_files': [f'dist/licenses/pdf-lib-dependencies/{dest.name}/{p}' for p in copied]})

# The fork's standard-font metrics must be the data whose Adobe AFM sources were verified for
# @pdf-lib/standard-fonts 1.0.0. Only the compression differs, so the Adobe notices carry over.
upstream_fonts, _ = fetch('@pdf-lib/standard-fonts', '1.0.0')
upstream_fonts = members(upstream_fonts)
decode = lambda raw: json.loads(zlib.decompress(base64.b64decode(json.loads(raw))))
metric_files = sorted(p for p in fork if p.startswith('src/packages/standard-fonts/') and p.endswith('.compressed.json') and p.count('/') == 3)
assert len(metric_files) == 15, metric_files
for path in metric_files:
    assert decode(fork[path]) == decode(upstream_fonts['es/' + path.rsplit('/', 1)[1]]), f'Metric data differs: {path}'
fonts_dir = out / f'cantoo-standard-fonts-{version}'
previous = json.loads((project / 'scripts/vendor-license-provenance.json').read_text())['pdf_lib']['adobe_metrics']
notice_lines = ['Copyright and trademark notices preserved from the published compressed metric data.',
                'Upstream converts the Adobe AFM metrics to compressed JSON and packages their',
                'encodings for JavaScript use; these are metrics, not embedded font programs.', '']
for path in metric_files:
    record = decode(fork[path])
    if isinstance(record, dict) and record.get('Notice'):
        notice_lines.extend([record.get('FontName', Path(path).name), record['Notice'], ''])
(fonts_dir / 'ADOBE-METRIC-NOTICES.txt').write_text('\n'.join(notice_lines).rstrip() + '\n')
adobe_sources = project / 'scripts/adobe-afm-notices'
for file in ('Adobe-APAFML.txt', 'Adobe-Core14-MustRead.html', 'ORIGINAL-PROJECT-NOTICE.txt'):
    shutil.copyfile(adobe_sources / file, fonts_dir / file)
assert sha256((fonts_dir / 'Adobe-Core14-MustRead.html').read_bytes()) == previous['original_notice_sha256']
in_tree[0]['notice_files'] += [f'dist/licenses/pdf-lib-dependencies/{fonts_dir.name}/{file}' for file in
                               ('ORIGINAL-PROJECT-NOTICE.txt', 'ADOBE-METRIC-NOTICES.txt', 'Adobe-APAFML.txt', 'Adobe-Core14-MustRead.html')]

summary = [
    f'{name} {version} — bundled dependency notices',
    '',
    'The application’s MIT license does not replace the licenses below.',
    f'The shipped pdf-lib.min.js is identical to the official {name} {version} npm UMD build,',
    'a maintained fork of pdf-lib (https://github.com/Hopding/pdf-lib). The bundle’s',
    'source map identifies the bundled packages; each version below is the npm release',
    'whose files match the bundled sources byte for byte.',
    '',
    'Full preserved notices and package metadata are in pdf-lib-dependencies/:',
    '',
]
for record in records:
    summary.append(f'- {record["name"]} {record["version"]} — {record["license"]}. Directory: {record["notice_directory"]}/')
summary.extend([
    f'- Standard 14 font metrics (the fork’s src/packages/standard-fonts) — MIT; original',
    '  Christopher Brown project attribution retained. The Adobe Core 14 font metric data',
    '  (identical to @pdf-lib/standard-fonts 1.0.0 once decompressed) retain their APAFML',
    '  redistribution notice and copyright/trademark notices.',
    f'  Directory: cantoo-standard-fonts-{version}/',
    f'- UPNG (the fork’s src/packages/upng) — MIT, Copyright (c) 2017 Photopea.',
    f'  Directory: cantoo-upng-{version}/',
    '',
    'Package download URLs, integrity hashes, and the verification method are recorded in',
    'scripts/vendor-license-provenance.json in the source repository. The main pdf-lib MIT',
    'license is pdf-lib-MIT.txt; it is identical to the fork’s LICENSE.md.',
])
(licenses / 'pdf-lib-dependencies.txt').write_text('\n'.join(summary) + '\n')

repository = published.get('repository')
repository = repository.get('url') if isinstance(repository, dict) else repository
provenance_path = project / 'scripts/vendor-license-provenance.json'
provenance = json.loads(provenance_path.read_text())
provenance['verification'] = (
    'All PDF.js files below match the official npm tarball byte-for-byte. pdf-lib.min.js matches the official '
    '@cantoo/pdf-lib npm UMD; its source map embeds every bundled source, and each third-party package is pinned '
    'to the npm release whose files match those sources byte for byte (the fork publishes no lockfile). '
    'Notices are copied from exact npm tarballs or clearly identified source headers.')
provenance['pdf_lib'] = {
    'package': name, 'version': version, 'published': built,
    'upstream': 'https://github.com/Hopding/pdf-lib', 'repository': repository,
    'git_head': npm_view(f'{name}@{version}', 'gitHead'),
    'tarball': registry['tarball'], 'tarball_integrity': registry['integrity'], 'tarball_sha256': sha256(archive),
    'bundle': 'dist/pdf-lib.min.js', 'bundle_sha256': sha256(bundle),
    'source_map_sha256': sha256(fork['dist/pdf-lib.min.js.map']),
    'first_party_sources_matched': len(first_party),
    'dependencies': records,
    'in_tree_packages': in_tree,
    'adobe_metrics': {**previous, 'verification': previous['verification'] + (
        f' {name} {version} ships the same metric records (its compressed JSON decodes identically to '
        '@pdf-lib/standard-fonts 1.0.0).')},
}
provenance_path.write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'package': f'{name}@{version}', 'bundled_packages': {r['name']: r['version'] for r in records},
                  'first_party_sources_matched': len(first_party), 'runtimeBytesChanged': False}))
