"""Reproduce fontkit notices from a frozen upstream rebuild and official npm tarball.

This is an offline audit helper. See dist/licenses/fontkit-dependencies/README.md
for the exact source commit and rebuild commands. It never changes runtime code.
"""
import argparse
import base64
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--upstream-root', required=True, type=Path)
parser.add_argument('--module-report', required=True, type=Path)
parser.add_argument('--tarball', required=True, type=Path)
parser.add_argument('--yarn-cache', required=True, type=Path)
args = parser.parse_args()
project = Path(__file__).resolve().parents[1]
out = project / 'dist/licenses/fontkit-dependencies'
out.mkdir(parents=True, exist_ok=True)
upstream = args.upstream_root.resolve()
modules = json.loads(args.module_report.read_text())
archive = args.tarball.read_bytes()
sha = lambda data: hashlib.sha256(data).hexdigest()
with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tar:
    published = json.loads(tar.extractfile('package/package.json').read())
    original = tar.extractfile('package/dist/fontkit.umd.js').read()
    minified = tar.extractfile('package/dist/fontkit.umd.min.js').read()
    readme = tar.extractfile('package/README.md').read()
assert published['name'] == '@pdf-lib/fontkit' and published['version'] == '1.1.1'
assert minified == (project / 'dist/assets/vendor/fontkit.umd.min.js').read_bytes()
assert original == (project / 'dist/licenses/fontkit-bundled-source.js').read_bytes()
rebuilt = (upstream / 'fontkit.audit.umd.js').read_bytes()
# Rollup's platform line endings do not alter emitted code.
assert rebuilt.replace(b'\r\n', b'\n') == original.replace(b'\r\n', b'\n'), 'Rebuilt bundle differs'
mit = (project / 'dist/licenses/pdf-lib-MIT.txt').read_text()
mit = re.sub(r'^Copyright .*\n\n', '', mit, flags=re.M)
(out / 'MIT-standard-text.txt').write_text(mit)
isc = '''ISC License\n\nPermission to use, copy, modify, and/or distribute this software for any\npurpose with or without fee is hereby granted, provided that the above\ncopyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES\nWITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF\nMERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR\nANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES\nWHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN\nACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF\nOR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.\n'''
(out / 'ISC-standard-text.txt').write_text(isc)
packages = {}
for item in modules:
    p = item.get('package')
    if not p or not str(p.get('root', '')).startswith(str(upstream / 'node_modules')):
        continue
    key = (p['name'], p['version'])
    entry = packages.setdefault(key, {'root': Path(p['root']), 'files': set()})
    entry['files'].add(str(Path(item['id']).relative_to(p['root'])))
assert ('rollup-plugin-node-globals', '1.4.0') in packages
records = []
notices = [
    'QFT PDF — @pdf-lib/fontkit 1.1.1 bundled dependency notices',
    '',
    'The runtime UMD bundle and preserved unminified source match the official npm artifact.',
    'Versions below come from the rendered modules of a byte-equivalent frozen rebuild.',
    'Author/contributor fields are upstream metadata credits, not invented copyright notices.',
    'Where the exact package supplies no standalone license file, its declared license is',
    'recorded, applicable full standard text is supplied, and source notices are retained.',
    'This inventory does not claim missing historical copyright statements have been supplied by upstream.',
    '',
]
for (name, version), data in sorted(packages.items()):
    root = data['root']
    metadata_bytes = (root / 'package.json').read_bytes()
    meta = json.loads(metadata_bytes)
    slug = name.replace('@', '').replace('/', '__') + '-' + version
    dest = out / slug
    dest.mkdir(parents=True, exist_ok=True)
    (dest / 'package.json').write_bytes(metadata_bytes)
    cache_candidates = [p / 'node_modules' / name for p in args.yarn_cache.glob('npm-' + re.sub(r'[^a-zA-Z0-9@-]', '-', name) + '-' + version + '-*')]
    cache_root = next((p for p in cache_candidates if (p / '.yarn-metadata.json').exists()), None)
    assert cache_root, (name, version, cache_candidates)
    assert json.loads((cache_root / 'package.json').read_text()) == meta
    yarn_meta_path = cache_root / '.yarn-metadata.json'
    yarn_meta = json.loads(yarn_meta_path.read_text()) if yarn_meta_path.exists() else {}
    remote = yarn_meta.get('remote', {})
    licenses = []
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if not path.is_file() or 'node_modules' in relative.parts or path.name.startswith('.'):
            continue
        if not re.match(r'^(?:licen[cs]e|copying|notice|authors)(?:[._-].*)?$', path.name, re.I):
            continue
        if relative.parent != Path('.') and not any(Path(file).is_relative_to(relative.parent) for file in data['files']):
            continue
        target = dest / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(path.read_bytes())
        licenses.append({'path': str(relative), 'sha256': sha(path.read_bytes())})
    source_comments = []
    seen = set()
    for relative in sorted(data['files']):
        path = root / relative
        if not path.is_file():
            continue
        source = path.read_text(errors='replace')
        for match in re.finditer(r'/\*[\s\S]*?\*/|(?:^[ \t]*//[^\n]*(?:\n|$))+', source, re.M):
            comment = match.group()
            if re.search(r'copyright|licensed?\b|permission is|redistribution', comment, re.I) and comment not in seen:
                seen.add(comment)
                source_comments.append(f'Upstream source: {relative}\n\n{comment}\n')
    if source_comments:
        (dest / 'SOURCE-NOTICES.txt').write_text('\n'.join(source_comments))
    record = {
        'name': name, 'version': version, 'declaredLicense': meta.get('license', meta.get('licenses')),
        'author': meta.get('author'), 'contributors': meta.get('contributors'),
        'repository': meta.get('repository'), 'sourceTarball': remote.get('resolved'),
        'integrity': remote.get('integrity'), 'tarballSha256': None,
        'renderedSourceFiles': sorted(data['files']), 'upstreamLicenseFiles': licenses,
        'retainedSourceNotices': bool(source_comments),
        'noticeDirectory': slug,
    }
    archive_path = cache_root / '.yarn-tarball.tgz'
    archive_bytes = archive_path.read_bytes()
    record['tarballSha256'] = sha(archive_bytes)
    expected = remote.get('integrity', '')
    if expected.startswith('sha512-'):
        assert 'sha512-' + base64.b64encode(hashlib.sha512(archive_bytes).digest()).decode() == expected
    elif remote.get('hash'):
        assert hashlib.sha1(archive_bytes).hexdigest() == remote['hash']
    records.append(record)
    notices.extend(['=' * 72, f'{name} {version}', f'Declared license: {record["declaredLicense"]}',
                    f'Author metadata: {json.dumps(record["author"], ensure_ascii=False)}',
                    f'Contributor metadata: {json.dumps(record["contributors"], ensure_ascii=False)}',
                    f'Repository: {json.dumps(record["repository"], ensure_ascii=False)}',
                    f'Full upstream metadata: {slug}/package.json'])
    if licenses:
        for license in licenses:
            notices.extend(['', f'Unmodified upstream file: {slug}/{license["path"]}', '', (dest / license['path']).read_text(errors='replace')])
    else:
        notices.extend(['No standalone license file is shipped in this exact package.',
                        'The declaration above comes from its unmodified package.json.',
                        'No missing upstream copyright statement is fabricated here.', '',
                        isc if record['declaredLicense'] == 'ISC' else mit])
    if source_comments:
        notices.extend(['', 'Preserved upstream source notices:', '\n'.join(source_comments)])
    notices.append('')
notices.extend(['=' * 72, 'Apache License 2.0 (for retained Google Brotli decoder notices)', '', (project / 'dist/licenses/pdfjs-Apache-2.0.txt').read_text()])
(out / 'NOTICES.txt').write_text('\n'.join(notices))
provenance = {
    'artifact': {'name': published['name'], 'version': published['version'],
        'sourceTarball': 'https://registry.npmjs.org/@pdf-lib/fontkit/-/fontkit-1.1.1.tgz',
        'tarballSha256': sha(archive), 'umdSha256': sha(original), 'minifiedUmdSha256': sha(minified)},
    'rebuild': {'repository': 'https://github.com/Hopding/fontkit',
        'commit': subprocess.check_output(['git', '-C', str(upstream), 'rev-parse', 'HEAD'], text=True).strip(),
        'sourcePackageVersion': json.loads((upstream / 'package.json').read_text())['version'],
        'yarnLockSha256': sha((upstream / 'yarn.lock').read_bytes()),
        'byteForByteEqual': rebuilt == original,
        'equalAfterCrLfNormalization': True,
        'renderedDependencyRecords': len(records)},
    'packages': records,
}
(out / 'provenance.json').write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + '\n')
(out / 'fontkit-package.json').write_text(json.dumps(published, indent=2) + '\n')
(project / 'dist/licenses/fontkit-README.md').write_bytes(readme)
print(json.dumps({'packages': len(records), 'runtimeBytesChanged': False, 'output': str(out)}))
