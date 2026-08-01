import zipfile
import xml.etree.ElementTree as ET
import sys

def read_docx(path):
    z = zipfile.ZipFile(path)
    xml_content = z.read('word/document.xml')
    root = ET.fromstring(xml_content)
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    paragraphs = []
    for p in root.findall('.//w:p', ns):
        texts = p.findall('.//w:t', ns)
        if texts:
            paragraphs.append(''.join(t.text for t in texts if t.text))
    print('\n'.join(paragraphs))

if __name__ == '__main__':
    read_docx(sys.argv[1])
