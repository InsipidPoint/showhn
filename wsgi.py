import os, sys
from paste.deploy import loadapp
current_dir = os.path.dirname(__file__)
os.symlink("/home/dotcloud/images", "/home/dotcloud/code/showhn/static/images")
os.symlink("/home/dotcloud/secret.py", "/home/dotcloud/code/showhn/scripts/secret.py")
application = loadapp('config:production.ini', relative_to=current_dir)
