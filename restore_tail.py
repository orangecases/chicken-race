import subprocess

try:
    # get HEAD~1 version
    old_code = subprocess.check_output(['git', 'show', 'HEAD~1:js/game.js'])

    target = b'if (btnDeleteRoom) {\r\n'
    idx = old_code.find(target)
    if idx == -1:
        target = b'if (btnDeleteRoom) {\n'
        idx = old_code.find(target)

    if idx != -1:
        missing_part = old_code[idx + len(target):]
        
        # Read current file
        with open('js/game.js', 'rb') as f:
            curr_code = f.read()
            
        # Append
        curr_idx = curr_code.find(target)
        if curr_idx != -1:
            new_code = curr_code[:curr_idx + len(target)] + missing_part
            with open('js/game.js', 'wb') as f:
                f.write(new_code)
            print('Successfully restored the missing code.')
        else:
            print('Could not find target in current file.')
    else:
        print('Could not find target in old file.')
except Exception as e:
    print(f"Error: {e}")
