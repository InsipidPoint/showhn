
#
# Author: MN
#
# Script to update show hn database
# get new posts asks for the string query, and the pre-existing collection
#
#



import Search
from pymongo import Connection
import pymongo

if __name__ == '__main__':
    MAX_QUERY = 100
    connection = Connection()
    db = connection["showhn"]
    posts_collection = db['posts']

    def get_new_posts(query, collection):
        loops = 0
        repeat = False
        to_be_inserted = []
        while (not repeat):
            lst = Search.search(query, loops * MAX_QUERY, modifier="create_ts desc")
            for post in lst:
                if posts_collection.find_one({"item.id":post['item']['id']}):
                    repeat = True
                    break
                else:
                    to_be_inserted.append(post)
            loops += 1
        return to_be_inserted

    to_be_inserted = get_new_posts('"show hn"', posts_collection)
    to_be_inserted.extend(get_new_posts("showhn", posts_collection))

    insertions = Search.remove_duplicate_results(to_be_inserted)

    if insertions:
        inserted = False
    else:
        inserted = True

    if not inserted:
        try:
            posts_collection.insert(insertions, safe=True)
            inserted = True
        except pymongo.errors.OperationFailure:
            inserted = False

    if not inserted:
        for post in insertions:
            inserted = False
            while not inserted:
                try:
                    posts_collection.update({"item.id":post['item']['id']}, post, upsert=True, safe=True)
                    inserted = True
                except pymongo.errors.OperationFailure:
                    inserted = False

    print(len(insertions))
