"""Write the password-protected test PDFs in tests/fixtures/.

They are encrypted with pypdf, not with the PDF library QFT PDF uses, so the
engine tests check decryption against another implementation. Each file has
two pages that read "Secret page 1" and "Secret page 2", and the title
"Locked report". Encryption uses random salts, so files differ between runs.

    python3 -m pip install pypdf cryptography
    python3 scripts/make-encrypted-fixtures.py
"""
import io
import pathlib

import pypdf
from pypdf.constants import UserAccessPermissions

FIXTURES = pathlib.Path(__file__).resolve().parent.parent / 'tests' / 'fixtures'
OWNER = 'owner secret'


def source():
    """A two-page PDF with Helvetica text, written by hand."""
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    for number in (1, 2):
        content = b'BT /F1 18 Tf 40 100 Td (Secret page %d) Tj ET' % number
        objects.append(b'<< /Length %d >>\nstream\n%s\nendstream' % (len(content), content))
    out = io.BytesIO()
    out.write(b'%PDF-1.7\n')
    offsets = []
    for index, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(b'%d 0 obj\n%s\nendobj\n' % (index, body))
    xref = out.tell()
    out.write(b'xref\n0 %d\n0000000000 65535 f \n' % (len(objects) + 1))
    for offset in offsets:
        out.write(b'%010d 00000 n \n' % offset)
    out.write(b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objects) + 1, xref))
    return out.getvalue()


def write(name, user_password, algorithm, permissions=None):
    writer = pypdf.PdfWriter(clone_from=pypdf.PdfReader(io.BytesIO(source())))
    writer.add_metadata({'/Title': 'Locked report'})
    options = {'user_password': user_password, 'owner_password': OWNER, 'algorithm': algorithm}
    if permissions is not None:
        options['permissions_flag'] = permissions
    writer.encrypt(**options)
    with open(FIXTURES / name, 'wb') as file:
        writer.write(file)


# Opens without a password, but restricts changes and copying (an owner password only).
write('owner-only-aes256.pdf', '', 'AES-256',
      UserAccessPermissions.PRINT | UserAccessPermissions.R7 | UserAccessPermissions.R8
      | UserAccessPermissions.R13 | UserAccessPermissions.R14 | UserAccessPermissions.R15
      | UserAccessPermissions.R16 | UserAccessPermissions.R17 | UserAccessPermissions.R18
      | UserAccessPermissions.R19 | UserAccessPermissions.R20 | UserAccessPermissions.R21
      | UserAccessPermissions.R22 | UserAccessPermissions.R23 | UserAccessPermissions.R24
      | UserAccessPermissions.R25 | UserAccessPermissions.R26 | UserAccessPermissions.R27
      | UserAccessPermissions.R28 | UserAccessPermissions.R29 | UserAccessPermissions.R30
      | UserAccessPermissions.R31 | UserAccessPermissions.R32)
# Need a password to open: the common kinds.
write('password-aes128.pdf', 'open sesame', 'AES-128')
write('password-rc4.pdf', 'open sesame', 'RC4-128')
write('password-aes256-unicode.pdf', 'Grüße 密码', 'AES-256')
