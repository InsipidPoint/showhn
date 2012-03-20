#!/usr/bin/env python

from Search import search
from fetch_screenshots import fetch
import re
import os

def extract_url(text):
    if not text:
        return None

    pattern = re.compile("https?://[^(\s|<)]+")
    urls = pattern.findall(text)
    if len(urls) == 0:
        return None
    else:
        min_url = urls[0]
        for url in urls:
            if len(url) < len(min_url):
                min_url = url
        return min_url

if __name__ == '__main__':
    IMAGE_DIRECTORY = "images"
    search_result = search('"show hn"', 0, 'create_ts desc', 16)
    posts = [p['item'] for p in search_result[1]]
    fetch_list = [(post['id'], post['url'] if post['url'] else extract_url(post['text'])) for post in posts]
    fetch(fetch_list, IMAGE_DIRECTORY)