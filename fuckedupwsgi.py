from pyramid.config import Configurator
from sqlalchemy import engine_from_config

from showhn.models import initialize_sql

engine = engine_from_config(settings, 'sqlalchemy.')
initialize_sql(engine)
config = Configurator()
config.add_static_view('static', 'showhn:static')
config.add_route('home', '/')
config.add_view('showhn.views.my_view',
               route_name='home',
               renderer='templates/mytemplate.pt')
config.add_route('view', '/view')
config.scan('showhn')
application = config.make_wsgi_app()
