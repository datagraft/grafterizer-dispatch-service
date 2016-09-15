#!groovy
node('swarm'){
	stage 'Build'
	checkout scm
	sh 'npm install'

	stage 'Test'
	//Download docker-compose and start containers
	sh 'curl -sSL https://raw.githubusercontent.com/datagraft/datagraft-platform/master/docker-compose.yml > docker-compose.yml'

	try {
		sh 'docker-compose pull'
		sh 'docker build -t datagraft/grafterizer-dispatch-service:latest .'
		sh 'docker-compose -p datagraft up -d --force-recreate'
		//Download and run startup script
		sh 'curl -sSL https://raw.githubusercontent.com/datagraft/datagraft-platform/master/startup.sh > startup.sh'
		sh 'bash startup.sh oauth2clientid oauth2clientsecret http://localhost:55557/oauth/callback'
		//Here is where tests are run, for now errors for static code analysis are swallowed
		sh 'grunt check || exit 0'
	} finally {
		// Tear down docker containers and remove volumes-- errors in this case will be swallowed
		sh 'docker-compose -p datagraft down -v || exit 0'
		sh 'rm -f docker-compose.yml'
		sh 'rm -f startup.sh'
	}

	if (env.BRANCH_NAME=="master") {
		stage 'Publish'
		timeout (time:30, unit:'MINUTES') {		
			input 'Do you want to publish image on hub?'
			sh 'docker tag datagraft/grafterizer-dispatch-service:latest datagraft/grafterizer-dispatch-service:$BUILD_NUMBER'
			sh 'docker push datagraft/grafterizer-dispatch-service:latest'
			sh 'docker push datagraft/grafterizer-dispatch-service:$BUILD_NUMBER'
			//Remove created image
			sh 'docker rmi datagraft/grafterizer-dispatch-service:latest'
		}	
	}

}
