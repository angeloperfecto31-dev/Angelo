import urllib.request
import json
req = urllib.request.Request("https://api.github.com/search/code?q=conduit+fill+table+language:json")
req.add_header('User-Agent', 'Mozilla/5.0')
try:
    response = urllib.request.urlopen(req)
    print("Success")
except Exception as e:
    print(e)
