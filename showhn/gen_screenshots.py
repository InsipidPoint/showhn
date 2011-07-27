#
# Author: MN
#
# Iterates over posts in database and makes screenshots for them.
# saves filename to db once done
# with varying width and quality to compare file sizes.
# takes one argument which is the directory name
#

import sys
from pymongo import Connection
from screenshot_api import save_file_to_fs
from screenshot_api import screenshot

if __name__ == '__main__':
    SELECTED_QUALITY = 0
    SELECTED_WIDTH = 0

    connection = Connection()
    db = connection['showhn']
    posts_collection = db['posts']

    dir = sys.argv[1]

    if dir[-1] is '/':
        formatted_dir = dir
    else:
        formatted_dir = dir + '/'

    cursor = posts_collection.find()
    for post in cursor:
        if not "filename" in post:
            url = post['item']['url']

            if url:
                hnid = post['item']['id']
                filename = formatted_dir + hnid + '.jpg'
                quality = SELECTED_QUALITY
                width = SELECTED_WIDTH
                save_file_to_fs(screenshot(url, width, quality), filename)
                post['filename'] = filename
                posts_collection.save(post)
