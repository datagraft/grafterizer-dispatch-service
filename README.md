# Grafterizer dispatch service

The Grafterizer dispatch service is a server component in the [DataGraft platform](https://datagraft.net/) that handles request authentication for [Grafterizer](https://github.com/datagraft/grafterizer) and dispatches requests for input and output across the multiple services.

## Security <a name="security"></a>
To enable secure interaction with the [Grafterizer](https://github.com/datagraft/grafterizer) user interface, the dispatch service supports a set of features, which are briefly described in this section.

The dispatch service uses **cookies** to store information about user sessions when interacting with [Grafterizer](https://github.com/datagraft/grafterizer). In order to prevent users from tampering with the session data, the service encrypts and signs the cookies using a *server key* specified in the environment of the server where the dispatch service is deployed.

The [DataGraft platform](https://datagraft.net/) ensures secure access to user assets through the [OAuth2 authorisation framework](http://oauth.net/2/). In its interaction with the platform, Grafterizer dispatch service enacts the role of the **client application** in the **OAuth2 authorisation code flow** (a good description of the roles and flows in OAuth2 can be found [here](https://www.digitalocean.com/community/tutorials/an-introduction-to-oauth-2)). Thereby, the dispatch service is configured with a OAuth2 *client identifier* and *client secret* and provides a *callback URL* (at `/oauth/callback` relative to the base address) for the DataGraft platform to communicate with. The client identifier and secret are obtained when the application is registered by the administrator of the DataGraft platform instance (through the OAuth application registration UI).

Finally, the Grafterizer dispatch service implements HTTP access control through the use of a CORS filter. The accepted origin (*i.e.*, [Grafterizer](https://github.com/datagraft/grafterizer)) is enabled by configuring an environmental variable on the server where the service is deployed.

## Dependencies

### Runtime
The dispatch service uses the *[Node.js](https://nodejs.org)* runtime, version 4.x (or higher) and the *Node package manager*. 

The component has been packaged in a [Docker](https://www.docker.com/) container and published on the official [DataGraft DockerHub](https://hub.docker.com/u/datagraft/).
### Other DataGraft components
![](https://cloud.githubusercontent.com/assets/8124245/17170080/d9788f7a-53ea-11e6-8ed5-f79246be9581.png)

## Installation / Setup

### Local installation (Windows command prompt)
 1. Clone the repository `git clone https://github.com/datagraft/grafterizer-dispatch-service.git`
 1. Install project dependencies using the Node package manager
   ```
   npm install

   ```
 1. Set the environmental variables for the service. That includes the setup for the [security](#security) features and the URLs (accessible over the Internet) of the DataGraft platform, [Grafterizer](https://github.com/datagraft/grafterizer), [Graftwerk](https://github.com/datagraft/graftwerk) (or [Graftwerk load balancer](https://github.com/datagraft/graftwerk-load-balancer)), and [Graftwerk cache](https://github.com/datagraft/graftwerk-cache).
 
  ```
  SET COOKIE_STORE_SECRET =  Cookie store secret key
  SET OAUTH2_CLIENT_ID =  OAuth2 client identifier
  SET OAUTH2_CLIENT_SECRET =  OAuth2 client secret
  SET DATAGRAFT_URI =  URL of a DataGraft platform instance
  SET CORS_ORIGIN = Public URL of the Grafterizer component
  SET GRAFTWERK_URI=  Public URL of the Graftwerk component or (optionally) a Graftwerk load balancer component
  SET GRAFTWERK_CACHE_URI =  Public URL of the Graftwerk cache component
  ```
  
 2. Run the Node server
 
  ```
  node server.js
  ```
  
### Building and running the Docker container
<!--
Official Docker container on DockerHub
Build and run Docker container
-->
In the folder where you cloned the project:
```
    docker build -t grafterizer-dispatch-service .
```
<!---
## Usage

Should have API docs for this component using Swagger preferably!
Also Grafterizer configuration and DataGraft tutorial.
Coming soon...
-->

## Questions or issues?

For posting information about bugs, questions and discussions please use the [Github Issues](https://github.com/datagraft/grafterizer-dispatch-service/issues) feature.

## Core Team

- [Antoine Pultier](https://github.com/yellowiscool) (author)
- [Nikolay Nikolov](https://github.com/nvnikolov)
- [Ana Tarita](https://github.com/taritaAna)

## License
> Available under the [Eclipse Public License](/LICENSE) (v1.0).

> Created by [Antoine Pultier](https://github.com/yellowiscool), 2016.
