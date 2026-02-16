#
#author: MN
#
#api for dealing with screenshots
# example:
# screenshot("google.com", 400, 80) 
# will return a file object of size 400, quality "80" 
#      (on a scale from 0 to 100)
#
# save_file_to_fs(screenshot("google.com", 400, 80), 'image.jpg')
# will save the above screenshot to disk in image.jpg file
#

import urllib2
import hashlib
from secret import API_KEY
from secret import SECRET
#from gridfs import GridFS

BOUNDS = "300x300"

def screenshot(url):
    api_key = API_KEY
    secret = SECRET
    url_no_spaces = ''.join([x if x != " " else "%20" for x in url])
    url_no_spaces = (url_no_spaces if url_no_spaces[-1] == "/" else url_no_spaces + "/")
    token = hashlib.md5( "%s+%s" % (secret, url_no_spaces) ).hexdigest()

    openable_url = "http://api.url2png.com/v3/%s/%s/%s/%s" % (api_key, token, BOUNDS, url_no_spaces)
    img_file = urllib2.urlopen(openable_url)
    return img_file

#began building out a gridFS solution, but 
#we should probably just store in file system
#def save_file_to_grid(img_file, fs):
#    return fs.put(img_file)

def save_file_to_fs(img_file, filename):
    new_file = open(filename, 'w')
    new_file.write(img_file.read())
    new_file.close()
