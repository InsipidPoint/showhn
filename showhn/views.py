from showhn.models import DBSession
from showhn.models import MyModel

from pyramid.view import view_config
from pyramid.response import Response

from scripts.Search import search
from pprint import pprint

def my_view(request):
    dbsession = DBSession()
    root = dbsession.query(MyModel).filter(MyModel.name==u'root').first()
    return {'root':root, 'project':'showhn'}

@view_config(route_name='view', renderer='templates/view.pt')
def view_hn(request):
    modifier = 'create_ts desc' if 'sort' not in request.params else request.params['sort']
    page_start = 0 if 'page' not in request.params else (int(request.params['page'])-1)*12
    posts = search('"show hn"', page_start, modifier, 12)
    posts = [p['item'] for p in posts]
    pprint(posts)
    return {'posts':posts}
