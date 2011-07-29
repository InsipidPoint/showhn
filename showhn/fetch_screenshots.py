

import sys
from pymongo import Connection
from screenshot_api import save_file_to_fs
from screenshot_api import screenshot

def fetch(ids_and_urls, directory):
    SELECTED_QUALITY = 70
    SELECTED_WIDTH = 500

    if directory[-1] is '/':
        formatted_dir = directory
    else:
        formatted_dir = directory + '/'

    lst = []

    for id_name, url in ids_and_urls:
        filename = formatted_dir + str(id_name) + '.jpg'
        try:
            fp = open(filename)
            ret_val = fp.read()
            fp.close()
        except:
            quality = SELECTED_QUALITY
            width = SELECTED_WIDTH
            save_file_to_fs(screenshot(url, width, quality), filename)
            fp = open(filename)
            ret_val = fp.read()
            fp.close()
        lst.append(ret_val)
    return lst

