from showhn.models import DBSession
from showhn.models import MyModel

from pyramid.view import view_config
from pyramid.response import Response

from scripts.Search import search
from scripts.fetch_screenshots import fetch
from pprint import pprint

def my_view(request):
    dbsession = DBSession()
    root = dbsession.query(MyModel).filter(MyModel.name==u'root').first()
    return {'root':root, 'project':'showhn'}

@view_config(route_name='view', renderer='templates/view.pt')
def view_hn(request):
    IMAGE_DIRECTORY = "static/images"
    modifier = 'create_ts desc' if 'sort' not in request.params else request.params['sort']
    page_start = 0 if 'page' not in request.params else (int(request.params['page'])-1)*12
    search_result = search('"show hn"', page_start, modifier, 12)
    posts = [p['item'] for p in search_result[1]]
#    pprint(posts)
    radio = modifier.split()
    fetch_list = [(post["id"], post["url"]) for post in posts]
    images_map = fetch(fetch_list, IMAGE_DIRECTORY)
    template_map = {'posts':posts, 'create_ts':'', 'points':'', 'num_comments':'', 'asc':'', 'desc':'', 'pages':search_result[0]/12 if search_result[0] < 980 else 82, 'current':page_start/12+1, 'image_map': images_map}
    template_map[radio[0]] = 'checked="checked"'
    template_map[radio[1]] = 'checked="checked"'
    return template_map
