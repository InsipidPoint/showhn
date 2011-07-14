import urllib2
import urllib
import json
import pprint

#cannot fetch more than 100 queries
MAX_QUERY = 100

#cannot search over limit + start of 1000
MAX_LIMIT = 1000

def search(query,start_point,modifier="asc"):
    queryDict = {"q":query,"start":start_point,"limit":MAX_QUERY,"sortby":"create_ts " + modifier}
    urlencoding = urllib.urlencode(queryDict)
    url = "http://api.thriftdb.com/api.hnsearch.com/items/_search?"
    req = urllib2.urlopen(url +urlencoding)
    return json.load(req)['results']

def search_for_all(query,modifier="asc"):
    start_point = 0
    results = []
    length = MAX_QUERY
    while start_point + MAX_QUERY <= MAX_LIMIT:
        results += search(query,start_point,modifier=modifier)
        start_point += MAX_QUERY
    return results

def double_search(query):
    return search_for_all(query,"asc") + search_for_all(query,"desc")



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

def search_for_showhn():
    list_with_duplicates = double_search('"show hn"') + search_for_all("showhn")
    return remove_duplicate_results(list_with_duplicates)

def sort_list_of_results(results,reverse=False):
    sorted(results,key=lambda result: result['item']['create_ts'], reverse=reverse)

complete_list = search_for_showhn()
