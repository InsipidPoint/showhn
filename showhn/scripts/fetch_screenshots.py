import sys
from pymongo import Connection
from screenshot_api import save_file_to_fs
from screenshot_api import screenshot
from threading import Thread

DUMMY_FILENAME = "dummy.jpg"
SELECTED_QUALITY = 70
SELECTED_WIDTH = 500

#input must be a list of id and url tuples
#output is a map from id to filename.
def fetch(ids_and_urls, directory):
    if directory[-1] is '/':
        formatted_dir = directory
    else:
        formatted_dir = directory + '/'

    ret_dict = {}
    dummy = formmatted_dir + DUMMY_FILENAME

    to_be_found = []
    for id_name, url in ids_and_urls:
        filename = formatted_dir + str(id_name) + '.jpg'
        try:
            fp = open(filename)
            fp.close()
            ret_dict[id_name] = filename
        except:
            ret_dict[id_name] = dummy

            to_be_found.append((id,url))
        lst.append(ret_val)
        thread = Thread()
    return ret_dict

class Fetcher:
    #requires a list of ids and urls
    def __call__(self, ids_and_urls):
        for hnid, url in ids_and_urls:
            filename = formatted_dir + str(id_name) + '.jpg'
            quality = SELECTED_QUALITY
            width = SELECTED_WIDTH
            save_file_to_fs(screenshot(url), filename)
            fp = open(filename)
            fp.close()
