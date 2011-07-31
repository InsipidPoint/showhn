showhn README

NB: . refers to the root directory

Run:
python ./showhn/update.py
to update the database.  Note!  You must start the database by referencing the ./data directory, like so:

mongod --dbpath ./data

how to make a twitter sharing link!

<a href="http://twitter.com/share" class="twitter-share-button" data-url="<URL TO LINK TO>" data-text="<SUGGESTED TEXT>" data-count="vertical" data-via="<TWITTER_ACCOUNT TO @>">Tweet</a><script type="text/javascript" src="http://platform.twitter.com/widgets.js"></script>

how to make a facebook liking link!

<div id="fb-root"></div><script src="http://connect.facebook.net/en_US/all.js#appId=197685243621657&amp;xfbml=1"></script><fb:like href="<URL TO LIKE>" send="true" width="450" show_faces="true" font=""></fb:like>

how to make a tumblr sharing link!

<!-- Put this tag wherever you want your button to appear -->
<span id="tumblr_button_abc123"></span>

include this: <script type="text/javascript" src="http://platform.tumblr.com/v1/share.js"></script>

also, this js shit:

<!-- Set these variables wherever convenient -->
<script type="text/javascript">
    var tumblr_link_url = "<URL>";
    var tumblr_link_name = "<NAME>";
    var tumblr_link_description = "<DESCRIPTION>";
</script>

<!-- Put this code at the bottom of your page -->
<script type="text/javascript">
    var tumblr_button = document.createElement("a");
    tumblr_button.setAttribute("href", "http://www.tumblr.com/share/link?url=" + encodeURIComponent(tumblr_link_url) + "&name=" + encodeURIComponent(tumblr_link_name) + "&description=" + encodeURIComponent(tumblr_link_description));
    tumblr_button.setAttribute("title", "Share on Tumblr");
    tumblr_button.setAttribute("style", "display:inline-block; text-indent:-9999px; overflow:hidden; width:20px; height:20px; background:url('http://platform.tumblr.com/v1/share_4.png') top left no-repeat transparent;");
    tumblr_button.innerHTML = "Share on Tumblr";
    document.getElementById("tumblr_button_abc123").appendChild(tumblr_button);
</script>

how to make a google plus one button!

<!-- Place this tag where you want the +1 button to render -->
<g:plusone href="<URL>"></g:plusone>

<!--  Place this tag after the last plusone tag -->
<script type="text/javascript">
  (function() {
    var po = document.createElement('script'); po.type = 'text/javascript'; po.async = true;
    po.src = 'https://apis.google.com/js/plusone.js';
    var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(po, s);
  })();
</script>
