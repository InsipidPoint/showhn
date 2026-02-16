#
# Author: MN
#
# Generates 100 different files that are all screenshots of google
# with varying width and quality to compare file sizes
# takes one argument which is the directory name
#

import sys
from screenshot_api import save_file_to_fs
from screenshot_api import screenshot

if __name__ == '__main__':
    QUALITY_INCREMENT = 10
    WIDTH_INCREMENT = 100

    dir = sys.argv[1]


    if dir[-1] is '/':
        formatted_dir = dir
    else:
        formatted_dir = dir + '/'

    WIDTH_INCREMENT

    for outer_loop in range(10):
        for inner_loop in range(10):
            filename = formatted_dir + "google.com" + str(outer_loop) + str(inner_loop) + '.jpg'
            quality = inner_loop*QUALITY_INCREMENT
            width = outer_loop*WIDTH_INCREMENT

            save_file_to_fs(screenshot("google.com", width, quality), filename)
