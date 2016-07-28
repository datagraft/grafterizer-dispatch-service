# Supported tags and respective `Dockerfile` links
-	[`latest` (*Dockerfile*)](https://github.com/datagraft/grafterizer-dispatch-service/blob/master/Dockerfile)

# What is the Grafterizer dispatch service?
The Grafterizer dispatch service is a server component in the [DataGraft platform](https://datagraft.net/) that handles request authentication for [Grafterizer](https://github.com/datagraft/grafterizer) and dispatches requests for input and output across the multiple services.

# How to use this Docker image
To run this image you need to have a running instance (accessible over the Internet) of the DataGraft platform, [Grafterizer](https://github.com/datagraft/grafterizer), [Graftwerk](https://github.com/datagraft/graftwerk) (or [Graftwerk load balancer](https://github.com/datagraft/graftwerk-load-balancer)), and [Graftwerk cache](https://github.com/datagraft/graftwerk-cache). Additionally, the following code snippet contains the necessary setup for the [security](https://github.com/datagraft/grafterizer-dispatch-service#security) features of DataGraft. For more details on the environment set up please visit [the Github repository](https://github.com/datagraft/grafterizer-dispatch-service).

```
docker run --net host \
  --name grafterizer-dispatch-service \
  -p <dispatcher service port>:8082 \
  -e COOKIE_STORE_SECRET=randomlongstring \
  -e OAUTH2_CLIENT_ID=clientidfromdatagraft \
  -e OAUTH2_CLIENT_SECRET=clientsecretfromdatagraft \
  -e DATAGRAFT_URI=http://<DataGraft platform URL>:<DataGraft platform port> \
  -e CORS_ORIGIN=http://<grafterizer URL>:<grafterizer port> \
  -e GRAFTWERK_URI=http://<graftwerk URL>:<graftwerk port> \
  -e GRAFTWERK_CACHE_URI=http://<graftwerk cache URL>:<graftwerk cache port> \
  -e PUBLIC_CALLBACK_SERVER=http://<dispatcher service URL>:<dispatcher service port> \
  -e PUBLIC_OAUTH2_SITE=http://<DataGraft platform URL>:<DataGraft platform port> \
  -d datagraft/grafterizer-dispatch-service 
```

This code runs the dispatcher service in the Docker host's network stack (see [Docker networking](https://docs.docker.com/engine/userguide/networking/dockernetworks/) for more details).

# License
This image is available under the [Eclipse Public License (v1.0)](https://github.com/datagraft/grafterizer-dispatch-service/blob/master/LICENSE).

# User Feedback
For posting information about bugs, questions and discussions please use the comment feature on this repository or the [Github Issues](https://github.com/datagraft/grafterizer-dispatch-service/issues) feature on the official repository.