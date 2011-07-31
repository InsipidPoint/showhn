from os import listdir
from os import remove
import sys
import md5

DEMO_CRAPPY = "1043491.jpg"

def strip(bad_file, directory):
    filenames = listdir(directory)

    fp = open(directory + bad_file)
    bad_contents = fp.read()
    bad_md5_digest = md5.md5(bad_contents).digest()
    fp.close()
    num = 0

    for filename in filenames:
        formatted_filename = directory + filename
        try:
            fp = open(formatted_filename)
            cur_contents = fp.read()
            fp.close()
            cur_md5_digest = md5.md5(cur_contents).digest()
            if bad_md5_digest == cur_md5_digest:
                num += 1
                print num
                remove(formatted_filename)
        except:
            pass

if __name__ == '__main__':
    direc = sys.argv[1]

    if direc[-1] is '/':
        formatted_dir = direc
    else:
        formatted_dir = direc + '/'
    strip(DEMO_CRAPPY, formatted_dir)
