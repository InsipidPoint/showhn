import Search
from pymongo import Connection
import pymongo

connection = Connection()
db = connection['showhn']


posts = Search.search_for_showhn()

effort = 0
bool = True
while (bool):
    posts_collection = db['posts']
    effort += 1
    try:
        posts_collection.insert(posts,safe=True)
        bool = False
    except pymongo.errors.OperationFailure:
        posts_collection.drop()
        bool = True

print effort
