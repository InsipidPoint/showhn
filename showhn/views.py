from showhn.models import DBSession
from showhn.models import MyModel

from pyramid.view import view_config
from pyramid.response import Response

from Search import search
from pprint import pprint

def my_view(request):
    dbsession = DBSession()
    root = dbsession.query(MyModel).filter(MyModel.name==u'root').first()
    return {'root':root, 'project':'showhn'}

@view_config(route_name='view', renderer='templates/view.pt')
def view_hn(request):
    posts = search('"show hn"', 0, 'desc', 20)
    pprint(posts)
    return {'posts':posts}
