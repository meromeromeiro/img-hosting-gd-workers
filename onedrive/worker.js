addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})
addEventListener('scheduled', event => {
  event.waitUntil(
    handleSchedule(event.scheduledTime)
  )
})

async function handleSchedule(scheduledDate) {
  console.log(scheduledDate);
  // let expires_at = await myKVGet('expires_time');
  // if ( Math.floor(scheduledDate/1000) + 900 > parseInt(expires_at)){
    await renewToken();
  // }
  // console.log(expires_at);
}

const prefixes = ['/img'];
async function handleRequest(request) {
  const urlObj = new URL(request.url) // 同样是域名
  let path = urlObj.href.substr(urlObj.origin.length) // 提取请求域名中的path

  for (let p of prefixes){
    console.log(p);
    if (path.startsWith(p)){
      path = path.substring(p.length);
    }
  }
  console.log(request.url);
  console.log(path);
  
  if (path == '/'){
    return index();
  }
  let p = '/api/';
  if (path.startsWith(p)){
    path = path.substring(p.length);
  }

  let r = null;
  if (path.startsWith('proxy')){
    r = await proxy(path);
  }else if (path.startsWith('redirect')){
    r = await redirect(path);
  }else if (path.startsWith('upload')){
    r = await upload(request);
  }else if (path.startsWith('delete')){
    r = await remove(path);
  }else if (path.startsWith('download')){
    r = await proxy(path);
  }
  if (r==null){
    r = new Response('error',{status:500});
  }
  r.headers.delete('vary'); // remove this head to enable cache, see document.
  r.headers.delete('Content-Disposition'); 
  r.headers.set('Access-Control-Allow-Origin', '*');
  r.headers.set('Cache-Control', 'public, max-age=31536000'); // one year    
  r.headers.delete('x-cache')
  r.headers.delete('content-security-policy')
  r.headers.delete('content-security-policy-report-only')
  r.headers.delete('clear-site-data')
  return r;
}

async function redirect(path){
  const params = path.split('/');
  if ( params.length < 2 ) { return null; }
  const objStr  = await KV.get('onedrive');
  const obj = JSON.parse(objStr);
  const access_token = obj.access_token;
  // const access_token = await myKVGet('access_token');
  const resp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${params[1]}/content`,{
    headers: {
      'Authorization': 'Bearer ' + access_token,
    },
    redirect: 'manual',
  });
  return new Response(resp.body, resp);
}

async function proxy(path){
  const params = path.split('/');
  if ( params.length < 2 ) { return null; }
  const objStr  = await KV.get('onedrive');
  const obj = JSON.parse(objStr);
  const access_token = obj.access_token;
  // const access_token = await myKVGet('access_token');
  const resp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${params[1]}/content`,{
    headers: {
      'Authorization': 'Bearer ' + access_token,
    },
    redirect: 'follow',
    // cf: {
    //   cacheTtl: 86400,
    //   cacheEverything: true,
    // },
  });
  return new Response(resp.body, resp);
//   return new Response(resp.body, { 
//     headers: {
//       'Content-Type': resp.headers.get('Content-Type'), 
//       'Cache-Control': 'public, max-age=31536000'
//     }, 
//     cf: {cacheTtl: 86400, cacheEverything: true},
//   });
}

async function remove(path){
  const params = path.split('/');
  if ( params.length != 3 ) { return null; }
  if ( hash(params[1]) !== params[2] ) { return new Response("not match", {status: 429}); }
  const objStr  = await KV.get('onedrive');
  const obj = JSON.parse(objStr);
  const access_token = obj.access_token;
  // const access_token = await myKVGet('access_token');
  const resp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${params[1]}`,{
    method: 'DELETE',
    headers: {
      'Authorization': 'Bearer ' + access_token,
    },
  })
  return new Response(resp.body, resp);
}

async function upload(request){
  if (request.method!='POST') { return null; }  
  const objStr  = await KV.get('onedrive');
  const obj = JSON.parse(objStr);
  const access_token = obj.access_token;
  // const access_token = await myKVGet('access_token');
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/img/${nowSeconds()}-${crypto.randomUUID().substring(0,8)}.jpg:/content`,{
    method: 'PUT',
    headers: {
      'Content-type': request.headers.get('Content-type'),
      'Authorization': 'Bearer ' + access_token,
    },
    body: request.body,
  }).then( r => r.json() )
  .catch( e => { console.log(e); });

//   }).then( r => r.text() );
//   });

//   }).then( r => {
//     const re = r.json();
//     if (re.id == undefined){
//       return new Response( (re) , {status: 500});
//     }
//     let res = {
//       'id': re.id,
//       'hash': hash(re.id),
//     }
//     return new Response(JSON.stringify(res), {status: 200});
//   }).catch( err => {
//     return new Response( err , {status: 500});
//   });

  // let resp = {};
  // try {
  //   resp = JSON.stringify(response);
  // }catch{
  //   return new Response( (response) , {status: 500});
  // }  

// try{
//     resp = JSON.parse(response)
//     let r = {
//         'id': resp.id,
//         'hash': hash(resp.id),
//     }
//     return new Response(JSON.stringify(r), {status: 200});
// }catch{
//     return new Response( (response) , {status: 500});
//     // return new Response( response.body , response);
// }

  if (response.id == undefined){
    return new Response( response , {status: 500});
  }

  let r = {
    'id': response.id,
    'hash': hash(response.id),
  }
  return new Response(JSON.stringify(r), {status: 200});

  return response; 
}

function hash(str) {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    let chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString();
}



const tenent_id = '[tenent_id]';
const client_id = '[client_id]';
const redirect_url = '[redirect_url]';
const client_secret = '[client_secret]';
const scope = 'offline_access%20Files.ReadWrite.All';
async function renewToken(){
  const objStr  = await KV.get('onedrive');
  const obj = JSON.parse(objStr);
  const refresh_token = obj.refresh_token;
  // const refresh_token = await myKVGet('refresh_token');
  // console.log('body', `client_id=${client_id}&scope=${scope}&refresh_token=${refresh_token}&grant_type=refresh_token&client_secret=${client_secret}`);
  const now = nowSeconds();
  const r = await fetch(`https://login.microsoftonline.com/${tenent_id}/oauth2/v2.0/token`, {
  // const r = await fetch(`https://moonchan.xyz/api-pack/acccfaca/`, {
    method: 'POST',
    headers: {
      'Content-Type':'application/x-www-form-urlencoded',
    },
    body: `client_id=${client_id}&scope=${scope}&refresh_token=${refresh_token}&grant_type=refresh_token&client_secret=${client_secret}`,
  }).then( r => r.json() );
  // }).then( r => r.text() );
  // console.log(`client_id=${client_id}&scope=${scope}&grant_type=refresh_token&refresh_token=${refresh_token}&client_secret=${client_secret}`);
  console.log(r);
  if (r.error !=undefined){
    console.log('???');
    console.log(r.error);
    return r;
  }

  // console.log('===1');
  // await myKVPut('expires_time', now + r.expires_in);
//   await myKVPut('expires_time', now + 3600 );
  // console.log(r.access_token);
//   await myKVPut('access_token', r.access_token);
  // console.log(r.refresh_token);  
//   await myKVPut('refresh_token', r.refresh_token);
  // console.log('===2');
  await KV.put('onedrive', JSON.stringify({
      'expires_time': now + 3600,
      'access_token': r.access_token,
      'refresh_token': r.refresh_token,
  }));
//   console.log(JSON.stringify({
//       'expires_time': now + 3600,
//       'access_token': r.access_token,
//       'refresh_token': r.refresh_token,
//   }))
  return r;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function index() {
  const respText = `<!DOCTYPE html>
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
        <label for="input">Choose a picture (you can also use Ctrl+v):</label>
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
    </html>`;
    const contentType = `text/html; charset=utf-8;`
  return new Response(respText, { headers: {'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000'}, cf: {cacheTtl: 31536000, cacheEverything: true} });
}
