import urllib
import urllib2
import hashlib
import sys
from secret import DI_ACCT
from secret import DI_TOKEN

def screenshot(url):
    #request = urllib2.Request('http://imagify.yi.org/api/')

    url_no_spaces = ''.join([x if x != " " else "%20" for x in url])
    url_no_spaces = (url_no_spaces if url_no_spaces[-1] == "/" else url_no_spaces + "/")
    #data = {'account':DI_ACCT, 'token':DI_TOKEN, 'url':url_no_spaces, 'width':'1400', 'height':'1050', 'resize':'', 'resize_width':'300', 'resize_height':'210'}
    #request.add_data(urllib.urlencode(data))

    #img_file = urllib2.urlopen(request)

    openable_url = "http://imagify.yi.org/api/sync?account=%s&token=%s&url=%s&width=1500&height=1050&resize&resize_width=300&resize_height=210" % (DI_ACCT, DI_TOKEN, url_no_spaces)
    img_file = urllib2.urlopen(openable_url)
    return img_file

def save_file_to_fs(img_file, filename):
    new_file = open(filename, 'w')
    new_file.write(img_file.read())
    new_file.close()

def main(argv=None):
    img_file = screenshot(sys.argv[1])
    save_file_to_fs(img_file, 'test.jpg')

if __name__ == "__main__":
    main()