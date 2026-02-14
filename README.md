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
cd client  
npm run dev
```

**back**

```
cd server  
node index.js
```
**zoomap**
is its own cuz i was not sure it will work. very messy
---

current pages

* `/videoapp` → see engagement
* `/poll` → based on fake data

---

to use Claude:
go to [https://platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) and create your API key
