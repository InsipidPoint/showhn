#
# Author: MN
# Search API
#

import urllib2
import urllib
import json
import pprint

#cannot fetch more than 100 queries
MAX_QUERY = 100

#cannot search over limit + start of 1000
MAX_LIMIT = 1000

#fetches query from start_point, modifier should be either asc or desc
#query_size > 0 and <= 100
#the modifiers we use are 'create_ts [desc|asc]', 'points [desc|asc]', 'num_comments [desc|asc]'
def search(query,start_point, modifier="create_ts desc", query_size = MAX_QUERY):
    if query_size > MAX_QUERY or query_size < 0:
        return None
    queryDict = {"q":query, "start":start_point, "limit":query_size, "sortby":modifier, "filter[fields][type]":"submission"}
    urlencoding = urllib.urlencode(queryDict)
    url = "http://api.thriftdb.com/api.hnsearch.com/items/_search?"
    req = urllib2.urlopen(url +urlencoding)
    return json.load(req)['results']

#gets all MAX_LIMIT either ascending or descending
def search_for_all(query,modifier="asc"):
    start_point = 0
    results = []
    length = MAX_QUERY
    while start_point + MAX_QUERY <= MAX_LIMIT:
        results += search(query,start_point,modifier=modifier)
        start_point += MAX_QUERY
    return results

#gets all MAX_LIMIT for for both ascending and descending
#for queries that have fewer than 2000 entries, this will fetch them all
def double_search(query):
    return search_for_all(query,"asc") + search_for_all(query,"desc")

#removes duplicates from a list
def remove_duplicate_results(list_with_duplicates):
    seen_id = set()
    results = []
    for elt in list_with_duplicates:
        if elt['item']['_id'] in seen_id:
            continue
        else:
            seen_id.add(elt['item']['_id'])
            results.append(elt)
    return results

#does the specific search that we are interested in, getting all 'show hn'
# and 'showhn' results
def search_for_showhn():
    list_with_duplicates = double_search('"show hn"') + search_for_all("showhn")
    return remove_duplicate_results(list_with_duplicates)

#sorts a list of items by timestamp, either reversibly or not
def sort_list_of_results(results,reverse=False):
    sorted(results,key=lambda result: result['item']['create_ts'], reverse=reverse)


#complete_list = search_for_showhn()
