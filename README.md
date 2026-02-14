yay treehacks this is sm fun i lurv zoom and multi-agent claude systems yay

---

# zoom working but very basic, need to figure out how to record meeting 

in the meantime:

* created a simple sample video
* detect the image using **MediaPipe**
* connect everything to **Express**
* used a mock dataset that simulates zoom data

---

# to run

**front**

```
c
''''''''''''''''
```

**back**

```
cd server  
node index.js
```
**zoomap**
is its own cuz i was not sure it will work. very messy
to run zoom app :

we need zoom repo
### 4. Set Up Authentication Backend

The Meeting SDK requires a signature from an authentication backend:

```bash
git clone https://github.com/zoom/meetingsdk-auth-endpoint-sample --depth 1
cd meetingsdk-auth-endpoint-sample
cp .env.example .env
```

Edit `.env` with your credentials:
```env
CLIENT_SECRET=your_client_secret_here
# or
ZOOM_MEETING_SDK_SECRET=your_sdk_secret_here
```

Start the auth backend:
```bash
npm install && npm run start
```

### 5. Run the Sample App
```bash
npm start
```


```
cd zoomapp/meetingsdk-auth-endpoint-sample
npm install
npm start
```

new terminal:

```
cd zoomapp
npx serve -p 8080
```

open http://localhost:8080

---

current pages

* `/videoapp` → see engagement
* `/poll` → based on fake data

---

to use Claude:
go to [https://platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) and create your API key
