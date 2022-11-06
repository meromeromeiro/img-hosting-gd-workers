/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npx wrangler dev src/index.js` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npx wrangler publish src/index.js --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
  timeout : 1799,
  prefix : '/img/'
  ,
  nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }
  ,
  async getAccessToken(env){    
    const signUrl = await env.GD.get('sign_url', { cacheTtl: 31536000});
		const jwt = await fetch(
			signUrl
		).then( r => r.text() );

    // console.log(jwt);

    const token = await fetch(
			'https://oauth2.googleapis.com/token',	{
				method: 'POST', // *GET, POST, PUT, DELETE, etc.
        headers: {
          // 'Content-Type': 'application/json'
          'Content-Type': 'application/x-www-form-urlencoded',
        },    
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
      }    
    ).then( r => r.json() );

    // console.log(token); 
    // console.log(token.toString()); 

    let accessToken = token.access_token;

    // console.log(accessToken);

    return accessToken.replace(/(.*\w)\.+$/g, '$1');
  }
	,
  async getAccessTokenWithCache(env){
    let accessToken = await env.GD.get('access_token', { cacheTtl: this.timeout });
    const lastTime = await env.GD.get('time', { cacheTtl: this.timeout });
    const lastTimeInt = parseInt(lastTime);
    const nowTimeInt = this.nowSeconds();
    // console.log(lastTime);
    // console.log(lastTimeInt);
    // console.log(nowTimeInt);
    if (nowTimeInt - lastTimeInt >= this.timeout){
      accessToken = await this.getAccessToken(env);
      await env.GD.put('access_token', accessToken);
      await env.GD.put('time', nowTimeInt);
    }
    return accessToken;
  }
  ,
  hash(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      let chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash.toString();
  }
  ,
  async api(request, env, ctx, path) {
    let r = null
    if (path.startsWith('download')){
      r = await this.download(path, env);
    }else if (path.startsWith('upload')){
      // todo: upload
      r = await this.upload(request, env);
      // return this.scopeRequest(request);
    }else if (path.startsWith('delete')){
      // const params = path.split('/');
      // if ( params.length != 3 ) { return null; }
      // if ( this.hash(params[1]) !== params[2] ) { return new Response("not match", {status: 429}); }
      // todo: delete
      r = await this.delete(path, env);
      // return new Response(params, {status: 500});
      // return this.scopeRequest(request);
    }
    return r;
  }
  ,
  async delete(path, env) {    
    const params = path.split('/');
    if ( params.length != 3 ) { return null; }
    if ( this.hash(params[1]) !== params[2] ) { return new Response("not match", {status: 429}); }

    const accessToken = await this.getAccessTokenWithCache(env);
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${params[1]}`, {
      method: 'DELETE', // *GET, POST, PUT, DELETE, etc.
      headers: {
        'Authorization': 'Bearer ' + accessToken,
      },
    });
    // return new Response('??');
    return resp;
  }
  ,
  async upload(request, env) {
    if (request.method!='POST') { return null; }
    const accessToken = await this.getAccessTokenWithCache(env);
    const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=media', {
      method: 'POST', // *GET, POST, PUT, DELETE, etc.
      headers: {
        'Content-type': request.headers.get('Content-type'),
        'Authorization': 'Bearer ' + accessToken,
      },
      body: request.body,
    // });
    }).then( r => r.json() );
    let r = {
      'id': resp.id,
      'hash': this.hash(resp.id),
    }
    return new Response(JSON.stringify(r), {status: 200});
    // return resp;
  }
  ,
  async download(path, env) {
    // path = path.substring('download'.length());
    const params =  path.split('/');
    if (params.length < 2) { return null; }
    const fileId = params[1];
    if (fileId == '') { return null; }
    const accessToken = await this.getAccessTokenWithCache(env);
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: {
        'Authorization': 'Bearer ' + accessToken,
      },      
      cf: {
        // Always cache this fetch regardless of content type
        // for a max of 5 seconds before revalidating the resource
        cacheTtl: 31536000,
        cacheEverything: true,
        //Enterprise only feature, see Cache API for other plans
        // cacheKey: someCustomKey,
      },
    });
    let newResp = new Response(resp.body, resp); // make mutable
    newResp.headers.delete('vary'); // remove this head to enable cache, see document.
    newResp.headers.set('Cache-Control', 'public, max-age=31536000'); // one year
    return newResp;
    return new Response(fileId, {status: 500});
  }
  ,
  scopeRequest(request) {
    const head = request.headers;
    head.forEach((value, key) => {
      console.log(`${key} ==> ${value}`);
    })
    // return new Response(head.get('Content-Type'));
    return new Response(request.body);
  }
  ,
	async fetch(request, env, ctx) {
    let r = null;

		// const accessToken = await this.getAccessToken();
      
    // console.log(accessToken);

    const accessToken = await this.getAccessTokenWithCache(env);

    // console.log(request.url);

    const urlObj = new URL(request.url); // 同样是域名
    let path = urlObj.pathname;
    if (path.startsWith(this.prefix)){
      path = path.substring(this.prefix.length-1);
    }

    if (path.startsWith('/api/')){
      path = path.substring(5);
      // return new Response(path, {status: 500}); // download/
      r = await this.api(request, env, ctx, path);
    }else {
      r = this.fetchFile(path);
    }
		// console.log(a);
    // return new Response(accessToken);
    if (r!=null) {
      return r;
    }
    return new Response("Not found", {status: 404});
		// return this.scopeRequest(request);
	},
  fetchFile(path) {
    let respText = null;
    let contentType = null;

    if (path == '/js.js') { respText = `alart('1')`; contentType = `application/javascript;`}
    else if (path == '/' )  { respText = `<!DOCTYPE html>
    <head>
      <title>another piece of shit</title>
      <style type="text/css">
        .item {
          clear: both;
        }
        img {
          margin: 24px;
          width: 150px;
          max-height: 300px;
          float: left;
        }
        input {
          padding: 8px;
          width: 600px;
        }
        .inner {
          margin: 8px;
        }
        .wrapper {
          margin-left: 200px;
        }
        </style>
    </head>
    <body id="body">
    
      <div id="wrap">
        <label for="input">Choose a picture:</label>
        <input type="file"
              id="input" name="img"
              accept="image/*"
              multiple />
      </div>
    
      <div id="div">
    
      </div>
      <script>
        base = document.location.href;
        function handleFile(file){      
          if (file){ // do nothing when paste texts.
            console.log(file);
            console.log(file.type); // 'image/png', while paste a picture.
            if (file.type.startsWith("image")) {
    
              const element = document.getElementById('div');
              let div = document.createElement('div');
              div.className = 'item';
              let img = document.createElement('img');
              
              div.appendChild(img);
              let divWrapper = document.createElement('div');
              divWrapper.className = 'wrapper';
              let urlTag = document.createElement('div');
              urlTag.className = 'inner';
              urlTag.innerText = '图片链接';
              divWrapper.appendChild(urlTag);
              let urlLink = document.createElement('input');
              urlLink.onmouseover = function(){urlLink.select();};
              
              divWrapper.appendChild(urlLink);
              let delTag = document.createElement('div');
              delTag.className = 'inner';
              delTag.innerText = '删除链接';
              divWrapper.appendChild(delTag);
              let delLink = document.createElement('input');
              delLink.onmouseover = function(){delLink.select();};
              
              divWrapper.appendChild(delLink);
              div.appendChild(divWrapper);
              element.insertBefore(div, element.firstChild);
    
              fetch('api/upload', {
                method: 'POST',
                body: file,
              }).then(r=>r.json())
              .then( resp => {
                img.src = \`\${base}api/download/\${resp.id}/\${file.name}\`;
                urlLink.value = \`\${base}api/download/\${resp.id}/\${file.name}\`;
                delLink.value = \`\${base}api/delete/\${resp.id}/\${resp.hash}\`;
              } )        
            }
          }
        }
    
        const inputElement = document.getElementById("input");
        inputElement.addEventListener("change", handleFiles, false);
        function handleFiles() {
          const files = this.files; /* now you can work with the file list */
          for (let i=0; i<files.length; i++){
            handleFile(files.item(i));
          }
        }
        document.addEventListener('paste', (event) => {
          console.log(event);
          const files = event.clipboardData.files;
          for (let i=0; i<files.length; i++){
            handleFile(files.item(i));
          }
        });
      </script>
    </body>
    </html>`; contentType = `text/html; charset=utf-8;`}

    if (respText == null) { return null; }
    return new Response(respText, { headers: {'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000'}, cf: {cacheTtl: 31536000, cacheEverything: true} });
  },
};
