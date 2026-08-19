"""Read one thing off an Android view dump.

A file rather than a line inside a shell script, for the reason this project
keeps relearning: a regular expression that crosses the host shell, `adb
shell`, and a nested quote loses a character somewhere and takes the meaning
with it.

    screen.py field           -> tap point of the text field
    screen.py button LABEL    -> tap point of a button with that label
    screen.py code PREFIX     -> the full text starting with PREFIX
"""
import re
import sys

xml = sys.stdin.read()
mode = sys.argv[1]


def centre(node: str) -> str:
    bounds = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
    if bounds is None:
        return ''
    left, top, right, bottom = (int(value) for value in bounds.groups())
    return f'{(left + right) // 2} {(top + bottom) // 2}'


if mode == 'code':
    found = re.search(rf'text="({re.escape(sys.argv[2])}[^"]+)"', xml)
    print(found.group(1) if found else '')
elif mode == 'field':
    found = re.search(r'<node[^>]*class="android\.widget\.EditText"[^>]*>', xml)
    print(centre(found.group(0)) if found else '')
elif mode == 'fieldlen':
    found = re.search(r'<node[^>]*class="android\.widget\.EditText"[^>]*>', xml)
    text = re.search(r'text="([^"]*)"', found.group(0)) if found else None
    print(len(text.group(1)) if text else 0)
elif mode == 'button':
    wanted = sys.argv[2].strip().upper()
    for node in re.finditer(r'<node[^>]*>', xml):
        text = re.search(r'text="([^"]*)"', node.group(0))
        if text is not None and text.group(1).strip().upper() == wanted:
            print(centre(node.group(0)))
            break
    else:
        print('')
else:
    raise SystemExit(f'unknown mode {mode}')
