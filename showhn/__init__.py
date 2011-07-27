from pyramid.config import Configurator
from sqlalchemy import engine_from_config

from showhn.models import initialize_sql

def main(global_config, **settings):
    """ This function returns a Pyramid WSGI application.
    """
    engine = engine_from_config(settings, 'sqlalchemy.')
    initialize_sql(engine)
    config = Configurator(settings=settings)
    config.add_static_view('static', 'showhn:static')
    config.add_route('home', '/')
    config.add_view('showhn.views.my_view',
                    route_name='home',
                    renderer='templates/mytemplate.pt')
    config.add_route('view', '/view')
    config.scan('showhn')
    return config.make_wsgi_app()

