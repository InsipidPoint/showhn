import sys
from pymongo import Connection
from screenshot_api import save_file_to_fs
from screenshot_api import screenshot
from threading import Thread
from time import time

DUMMY_FILENAME = "static/dummy.png"
NONE_FILENAME = "static/none.png"
SELECTED_QUALITY = 70
SELECTED_WIDTH = 500
TIMEOUT = 600

#input must be a list of id and url tuples
#output is a map from id to filename.
def fetch(ids_and_urls, directory):
    if directory[-1] is '/':
        formatted_dir = directory
    else:
        formatted_dir = directory + '/'

    ret_dict = {}
    dummy = DUMMY_FILENAME
    nonefile = NONE_FILENAME

    to_be_found = []
    fetcher = Fetcher()
        
    for id_name, url in ids_and_urls:
        png_filename = formatted_dir + str(id_name) + '.png'
        if url is None:
            ret_dict[id_name] = nonefile
            continue
        try:
            fp = open(png_filename)
            temp = fp.read()
            fp.close()
            if len(temp) < 100:
                found_file = False
            else:
                ret_dict[id_name] = png_filename
                found_file = True
        except:
            found_file = False

        if not found_file:
            jpg_filename = formatted_dir + str(id_name) + '.jpg'
            try:
                fp = open(jpg_filename)
                fp.close()
                ret_dict[id_name] = jpg_filename
            except:
                time_str = str(time())
                fp = open(png_filename, "w")
                fp.write(time_str)
                fp.close()
                ret_dict[id_name] = dummy
                to_be_found.append((id_name,url,time_str))

    thread = Thread(target=fetcher, args = (to_be_found, formatted_dir))
    thread.start()

    return ret_dict

class Fetcher:
    #requires a list of ids and urls
    def __call__(self, ids_and_urls_and_times, formatted_dir):
        for hnid, url, time_str in ids_and_urls_and_times:
            filename = formatted_dir + str(hnid) + '.png'
            try:
                fp = open(filename)
                cur_str = fp.read()
                fp.close()
                if cur_str == time_str:
                    quality = SELECTED_QUALITY
                    width = SELECTED_WIDTH
                    save_file_to_fs(screenshot(url), filename)
            except:
                pass
