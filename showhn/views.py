from showhn.models import DBSession
from showhn.models import MyModel

from pyramid.view import view_config
from pyramid.response import Response
from pyramid.httpexceptions import HTTPFound

from scripts.Search import search
from scripts.fetch_screenshots import fetch
from pprint import pprint

import re

def my_view(request):
    return HTTPFound(location=request.route_url('view'))

#returns the shortest url in the text
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

@view_config(route_name='view', renderer='templates/view.pt')
def view_hn(request):
    IMAGE_DIRECTORY = "static/images"
    modifier = 'create_ts desc' if 'sort' not in request.params else request.params['sort']
    page_start = 0 if 'page' not in request.params else (int(request.params['page'])-1)*12
    search_result = search('"show hn"', page_start, modifier, 12)
    posts = [p['item'] for p in search_result[1]]
#    pprint(posts)
    radio = modifier.split()
    fetch_list = [(post['id'], post['url'] if post['url'] else extract_url(post['text'])) for post in posts]
    url_map = {}
    for item in fetch_list:
        url_map[item[0]] = item[1]
    images_map = fetch(fetch_list, IMAGE_DIRECTORY)
    template_map = {'posts':posts, 'create_ts':'', 'points':'', 'num_comments':'', 'asc':'', 'desc':'', 'pages':search_result[0]/12 if search_result[0] < 980 else 82, 'current':page_start/12+1, 'image_map':images_map, 'url_map':url_map}
    template_map[radio[0]] = 'checked="checked"'
    template_map[radio[1]] = 'checked="checked"'
    return template_map
