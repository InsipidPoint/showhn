from showhn.models import DBSession
from showhn.models import MyModel

from pyramid.view import view_config
from pyramid.response import Response

def my_view(request):
    dbsession = DBSession()
    root = dbsession.query(MyModel).filter(MyModel.name==u'root').first()
    return {'root':root, 'project':'showhn'}

@view_config(route_name='view')
def view_hn(request):
    return Response('okay')
