"""Audit the vendored fontkit bundle (@cantoo/fontkit) and reproduce its notices.

This is a maintainer helper; it never changes runtime code. Run it after
updating dist/assets/vendor/fontkit.umd.min.js:

    npm pack @cantoo/fontkit@<version>          # in an empty directory
    python3 scripts/collect-fontkit-notices.py --tarball <that .tgz> --cache <empty dir>

It checks that the shipped bundle is the official npm UMD build, reads the
bundle's source map (which embeds every source file), checks the package's own
sources against the published src/ files, and pins each bundled third-party
package to the npm version whose files match byte for byte. Downloads go to
--cache and are checked against the registry's integrity hashes. It then
writes dist/licenses/fontkit-dependencies/, dist/licenses/fontkit-dependencies.txt,
dist/licenses/fontkit-MIT.txt, dist/licenses/fontkit-README.md and the fontkit
record in scripts/vendor-license-provenance.json.
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
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--tarball', required=True, type=Path, help='the official @cantoo/fontkit npm tarball')
parser.add_argument('--cache', required=True, type=Path, help='directory for dependency tarballs')
args = parser.parse_args()
project = Path(__file__).resolve().parents[1]
licenses = project / 'dist/licenses'
out = licenses / 'fontkit-dependencies'
cache = args.cache.resolve()
cache.mkdir(parents=True, exist_ok=True)
sha256 = lambda data: hashlib.sha256(data).hexdigest()
sri = lambda data: 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode()
LICENSE_FILE = re.compile(r'(?i)^(licen[cs]e|copying|notice)')
# The MIT terms, for packages that declare MIT but publish no license file. No
# copyright statement is invented for them.
MIT_TERMS = '''MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
'''


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


def with_mapped_sources(contents):
    """A package's files, plus original sources embedded in its own source maps.

    A bundler that follows a dependency's source map (dfa publishes only
    compiled files) records the original source path and text instead."""
    files = {path: data.decode('utf8', 'replace') for path, data in contents.items()}
    for path, data in contents.items():
        if not path.endswith('.map'):
            continue
        try:
            mapped = json.loads(data)
        except ValueError:
            continue
        base = Path(path).parent
        for source, text in zip(mapped.get('sources', []), mapped.get('sourcesContent') or []):
            if text is not None:
                resolved = (base / source).as_posix()
                parts = []
                for part in resolved.split('/'):
                    if part == '..':
                        parts = parts[:-1]
                    elif part not in ('', '.'):
                        parts.append(part)
                files.setdefault('/'.join(parts), text)
    return files


def source_notices(files):
    """License and copyright comments from bundled source files, verbatim."""
    comments, seen = [], set()
    for path in sorted(files):
        for match in re.finditer(r'/\*[\s\S]*?\*/|(?:^[ \t]*//[^\n]*(?:\n|$))+', files[path], re.M):
            comment = match.group()
            if re.search(r'copyright|licensed?\b|permission is|redistribution', comment, re.I) and comment not in seen:
                seen.add(comment)
                comments.append(f'Upstream source: {path}\n\n{comment}\n')
    return comments


# The vendored bundle is the official npm UMD build.
archive = args.tarball.read_bytes()
package = members(archive)
published = json.loads(package['package.json'])
name, version = published['name'], published['version']
assert name == '@cantoo/fontkit', name
registry = npm_view(f'{name}@{version}', 'dist')
assert sri(archive) == registry['integrity'], 'The fontkit tarball does not match the registry integrity'
bundle = package['dist/fontkit.umd.min.js']
assert bundle == (project / 'dist/assets/vendor/fontkit.umd.min.js').read_bytes(), 'dist/assets/vendor/fontkit.umd.min.js differs from the npm UMD'
built = npm_view(name, 'time')[version]
source_map = json.loads(package['dist/fontkit.umd.min.js.map'])
sources = dict(zip(source_map['sources'], source_map['sourcesContent']))

# The package's own sources in the map are its published src/ files.
first_party = {path: text for path, text in sources.items() if 'node_modules' not in path}
for path, text in first_party.items():
    published_path = re.sub(r'^\.\./', '', path)
    assert package.get(published_path, b'').decode('utf8') == text, f'Bundled source differs from the published file: {path}'

# Third-party sources: pin each package to the npm version whose files match byte for byte.
wanted = {}
for path, text in sources.items():
    match = re.search(r'node_modules/((?:@[^/]+/)?[^/]+)/(.+)$', path)
    if match:
        wanted.setdefault(match.group(1), {})[match.group(2)] = text
if out.exists():
    shutil.rmtree(out)
out.mkdir(parents=True)
apache = (licenses / 'pdfjs-Apache-2.0.txt').read_bytes()
records = []
for dependency, files in sorted(wanted.items()):
    times = npm_view(dependency, 'time')
    candidates = sorted((v for v, t in times.items() if v not in ('created', 'modified') and t <= built and not re.search(r'[-+]', v)),
                        key=lambda v: times[v], reverse=True)
    found = None
    for candidate in candidates:
        data, dist = fetch(dependency, candidate)
        contents = members(data)
        available = with_mapped_sources(contents)
        if all(available.get(path) == text for path, text in files.items()):
            found = (candidate, data, dist, contents)
            break
    assert found, f'No published version of {dependency} matches the bundled sources'
    candidate, data, dist, contents = found
    meta = json.loads(contents['package.json'])
    slug = dependency.replace('@', '').replace('/', '-') + '-' + candidate
    dest = out / slug
    dest.mkdir()
    (dest / 'package.json').write_bytes(contents['package.json'])
    license_files = sorted(p for p in contents if '/' not in p and LICENSE_FILE.match(p))
    for path in license_files:
        (dest / path).write_bytes(contents[path])
    notice_files = list(license_files)
    if not license_files and meta.get('license') == 'MIT':
        (dest / 'MIT-standard-text.txt').write_text(
            f'{dependency} {candidate} declares the MIT license in package.json but publishes no license file.\n'
            'The standard MIT terms follow. No copyright statement is invented here; see package.json\n'
            'for author metadata.\n\n' + MIT_TERMS)
        notice_files.append('MIT-standard-text.txt')
    comments = source_notices(files)
    if comments:
        (dest / 'SOURCE-NOTICES.txt').write_text('\n'.join(comments))
        notice_files.append('SOURCE-NOTICES.txt')
    # Source headers that grant the Apache License (Google's Brotli decoder) travel with its text.
    if any('Apache License' in text for text in files.values()):
        (dest / 'Apache-2.0.txt').write_bytes(apache)
        notice_files.append('Apache-2.0.txt')
    records.append({
        'name': dependency, 'version': candidate, 'license': meta.get('license'), 'author': meta.get('author'),
        'contributors': meta.get('contributors'), 'repository': meta.get('repository'),
        'tarball': dist['tarball'], 'integrity': dist['integrity'], 'tarball_sha256': sha256(data),
        'bundled_files_matched': len(files), 'notice_directory': slug,
        'notice_files': [f'dist/licenses/fontkit-dependencies/{slug}/{p}' for p in notice_files],
    })

# Packages kept inside fontkit's own source tree.
in_tree = []
for folder in ('unicode-properties', 'unicode-trie'):
    base = f'src/packages/{folder}/'
    meta = json.loads(package[base + 'package.json'])
    dest = out / f'cantoo-fontkit-{folder}-{version}'
    dest.mkdir()
    (dest / 'package.json').write_bytes(package[base + 'package.json'])
    copied = []
    for path in sorted(p for p in package if p.startswith(base) and '/' not in p[len(base):] and LICENSE_FILE.match(p[len(base):])):
        (dest / path[len(base):]).write_bytes(package[path])
        copied.append(path[len(base):])
    bundled = {p: t for p, t in first_party.items() if p.startswith(f'../{base}')}
    assert bundled, f'{base} is not in the bundle'
    in_tree.append({'source': base.rstrip('/'), 'name': meta.get('name'), 'version': meta.get('version'),
                    'license': meta.get('license'), 'author': meta.get('author'), 'bundled_files': len(bundled),
                    'notice_directory': dest.name,
                    'notice_files': [f'dist/licenses/fontkit-dependencies/{dest.name}/{p}' for p in copied]})

# fontkit's Unicode property tables are generated from the Unicode Character Database.
# Unicode's license terms travel with them, copied from Unicode's CLDR JSON package.
cldr_data, cldr_dist = fetch('cldr-core', '49.0.0')
cldr_license = members(cldr_data)['LICENSE'].decode('utf8')
terms = cldr_license[cldr_license.index('NOTICE TO USER'):]
assert terms.rstrip().endswith('SPDX-License-Identifier: Unicode-3.0')
unicode_dir = out / f'cantoo-fontkit-unicode-properties-{version}'
(unicode_dir / 'UNICODE-DATA-NOTICE.txt').write_text(
    'The Unicode property tables in this package (data.trie, bundled through data-trie.js)\n'
    'are generated from the Unicode Character Database with the codepoints package\n'
    '(see generate.js in the published @cantoo/fontkit package).\n\n'
    'The Unicode Character Database is copyright Unicode, Inc. and is distributed under the\n'
    'Unicode License V3 (SPDX-License-Identifier: Unicode-3.0), whose terms follow. They are\n'
    'copied verbatim from the LICENSE of the cldr-core 49.0.0 npm package (Unicode CLDR JSON;\n'
    f'{cldr_dist["integrity"]}),\n'
    'from "NOTICE TO USER" onwards; the paragraph before them there concerns the LDML\n'
    'specification only. Unicode publishes the notice at https://www.unicode.org/license.txt.\n\n'
    'UNICODE LICENSE V3\n\nCOPYRIGHT AND PERMISSION NOTICE\n\nCopyright © Unicode, Inc.\n\n' + terms)
in_tree[0]['notice_files'].append(f'dist/licenses/fontkit-dependencies/{unicode_dir.name}/UNICODE-DATA-NOTICE.txt')
in_tree[0]['unicode_data'] = {'license': 'Unicode-3.0', 'terms_from': cldr_dist['tarball'], 'terms_integrity': cldr_dist['integrity']}

# The package's own license and README.
(licenses / 'fontkit-MIT.txt').write_bytes(package['LICENSE'])
(licenses / 'fontkit-README.md').write_bytes(package['README.md'])

summary = [
    f'{name} {version} — bundled dependency notices',
    '',
    'The application’s MIT license does not replace the licenses below.',
    f'The shipped fontkit.umd.min.js is identical to the official {name} {version} npm UMD build,',
    'a maintained fork of fontkit (https://github.com/foliojs/fontkit). Its own license is',
    'fontkit-MIT.txt. The bundle’s source map identifies the bundled packages; each version',
    'below is the npm release whose files match the bundled sources byte for byte.',
    '',
    'Full preserved notices and package metadata are in fontkit-dependencies/:',
    '',
]
for record in records:
    summary.append(f'- {record["name"]} {record["version"]} — {record["license"]}. Directory: {record["notice_directory"]}/')
    if any(path.endswith('Apache-2.0.txt') for path in record['notice_files']):
        summary.append('  Its decoder sources keep Google’s Apache License 2.0 headers; the license text is included.')
for record in in_tree:
    summary.append(f'- {record["name"]} (fontkit’s {record["source"]}) — {record["license"]}. Directory: {record["notice_directory"]}/')
    if record.get('unicode_data'):
        summary.append('  Its Unicode property data come from the Unicode Character Database: Unicode License V3.')
summary.extend([
    '',
    'Package download URLs, integrity hashes, and the verification method are recorded in',
    'scripts/vendor-license-provenance.json in the source repository.',
])
(licenses / 'fontkit-dependencies.txt').write_text('\n'.join(summary) + '\n')

repository = published.get('repository')
repository = repository.get('url') if isinstance(repository, dict) else repository
provenance_path = project / 'scripts/vendor-license-provenance.json'
provenance = json.loads(provenance_path.read_text())
provenance['verification'] = (
    'All PDF.js files below match the official npm tarball byte-for-byte. pdf-lib.min.js and fontkit.umd.min.js '
    'match the official @cantoo/pdf-lib and @cantoo/fontkit npm UMD builds; their source maps embed every bundled '
    'source, and each third-party package is pinned to the npm release whose files match those sources byte for '
    'byte (neither fork publishes a lockfile). Notices are copied from exact npm tarballs or clearly identified '
    'source headers.')
provenance['fontkit'] = {
    'package': name, 'version': version, 'published': built,
    'upstream': 'https://github.com/foliojs/fontkit', 'repository': repository,
    'git_head': npm_view(f'{name}@{version}', 'gitHead'),
    'tarball': registry['tarball'], 'tarball_integrity': registry['integrity'], 'tarball_sha256': sha256(archive),
    'bundle': 'dist/fontkit.umd.min.js', 'bundle_sha256': sha256(bundle),
    'source_map_sha256': sha256(package['dist/fontkit.umd.min.js.map']),
    'first_party_sources_matched': len(first_party),
    'dependencies': records,
    'in_tree_packages': in_tree,
}
provenance_path.write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'package': f'{name}@{version}', 'bundled_packages': {r['name']: r['version'] for r in records},
                  'first_party_sources_matched': len(first_party), 'runtimeBytesChanged': False}))
