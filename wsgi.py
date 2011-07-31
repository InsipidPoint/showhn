import os, sys
from paste.deploy import loadapp
current_dir = os.path.dirname(__file__)
#os.symlink(current_dir + "../images", current_dir + "/static/images")
application = loadapp('config:production.ini', relative_to=current_dir)
