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
from thumbalizr_api import save_file_to_fs
from thumbalizr_api import screenshot

if __name__ == '__main__':
    SELECTED_QUALITY = 70
    SELECTED_WIDTH = 300

    connection = Connection("mongodb://root:qFohXA8ISx0uBXjNJz7Z@7fc2f09f.dotcloud.com:12015")
    db = connection['showhn']
    posts_collection = db['posts']

    direc = sys.argv[1]

    if direc[-1] is '/':
        formatted_dir = direc
    else:
        formatted_dir = direc + '/'

    cursor = posts_collection.find()
    for post in cursor:
        if not "filename" in post:
            url = post['item']['url']

            if url:
                hnid = post['item']['id']
                filename = formatted_dir + str(hnid) + '.jpg'

                try:
                    tmp = open(filename)
                    tmp.close()
                except:
                
                    quality = SELECTED_QUALITY
                    width = SELECTED_WIDTH
                    save_file_to_fs(screenshot(url, width, quality), filename)
                #                post['filename'] = filename
                    posts_collection.save(post)
