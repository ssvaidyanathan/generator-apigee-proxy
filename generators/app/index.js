const Generator = require('yeoman-generator');
const OptionOrPrompt = require('yeoman-option-or-prompt');
const swaggerParser = require('swagger-parser');
const util = require('util');
const fs = require('fs');
const fsy = require('fs-extra');
const path = require('path');
const xpath = require('xpath')
const { DOMParser } = require('@xmldom/xmldom')
const xmlFormatter = require('xml-formatter');
const xml2js = require('xml2js');
const parser = new xml2js.Parser({ explicitArray: true });
const builder = new xml2js.Builder();
const swaggerParseFn = util.promisify(swaggerParser.parse.bind(swaggerParser))

const validators = require('./validators.js');

//yo apigee-proxy MockTarget v1 /v1/mock secure TS-Mock https://raw.githubusercontent.com/apigee/api-platform-samples/master/default-proxies/helloworld/openapi/mocktarget3.0.yaml . true

module.exports = class extends Generator {
	// note: arguments and options should be defined in the constructor.
	constructor(args, opts) {
	   super(args, opts);
	   this.argument("name", { type: String, required: false });
	   this.argument("version", { type: String, required: false });
	   this.argument("basePath", { type: String, required: false });
	   this.argument("northboundDomain", { type: String, required: false });
	   //this.argument("targetServer", { type: String, required: false });
	   this.argument("targetUrl", { type: String, required: false });
	   this.argument("spec", { type: String, required: false });
	   this.argument("destination", { type: String, required: false });
	   this.argument("applyPolicies", { type: String, required: false });
	   this.optionOrPrompt = OptionOrPrompt;
	}

	async prompting() {
		this.answers = await this.optionOrPrompt([
			{
				type: 'input',
				name: 'name',
				message: "What is your proxy's name?",
				default: 'MockTarget',
				validate: validators.name
			},
			{
				type: 'input',
				name: 'version',
				message: "What is your proxy's version?",
				default: 'v1',
				validate: validators.version
			},
			{
				type: 'input',
				name: 'basePath',
				message: "What is your proxy's basePath?",
				default: '/v1/mock'
			},
			{
				type: 'input',
				name: 'northboundDomain',
				message: "What is your proxy's northboundDomain, for ex api.acme.com?",
				default: 'api.acme.com',
				validate: validators.northboundDomain
			},
			/*{
				type: 'input',
				name: 'targetServer', 
				message: "What is your proxy's targetServer? (comma separated)",
				default: 'TS-Mock'
			},*/
			{
				type: 'input',
				name: 'targetUrl', 
				message: "What is your proxy's target URL?",
				default: 'https://mocktarget.apigee.net'
			},
			{
				type: 'input',
				name: 'spec',
				message: "Please provide the path of your spec",
				default: 'https://raw.githubusercontent.com/apigee/api-platform-samples/master/default-proxies/helloworld/openapi/mocktarget3.0.yaml',
				validate: validators.spec
			},
			{
				type: 'input',
				name: 'destination',
				message: "Please provide the destination path of your proxy",
				default: '.'
			},
			{
				type: 'confirm',
				name: 'applyPolicies',
				message: "Do you want to apply the global policies?",
				initial: true
			}
		]);
	}

	async openapiToApigee(){
	    this.log('Creating API Proxy bundle...');
	    this.spawnCommandSync('openapi2apigee',
      		['generateApi', `${this.answers.name}-${this.answers.version}`, 
      			'-s', this.answers.spec, '-d', this.answers.destination] );
      	var dir = `${this.answers.destination}/${this.answers.name}-${this.answers.version}/openapi`;
  		if (!fs.existsSync(dir)){
		    fs.mkdirSync(dir);
		}
      	let api = await swaggerParseFn(this.answers.spec);
      	//update servers with northboundDomain and basePath
      	/*let servers = api.servers;
      	for (var i = 0; i < servers.length; i++) {
      		servers[i].url = `https://${this.answers.northboundDomain}${this.answers.basePath}`;
      	}*/
      	api.servers = [{
  			url: `https://${this.answers.northboundDomain}${this.answers.basePath}`
  		}];
      	var filepath = `${dir}/openapi.json`;
      	fs.writeFileSync(filepath, JSON.stringify(api, undefined, 2)); 
      	var openapiResourceDir = `${this.answers.destination}/${this.answers.name}-${this.answers.version}/apiproxy/resources/oas`;
  		if (!fs.existsSync(openapiResourceDir)){
		    fs.mkdirSync(openapiResourceDir, { recursive: true });
		}
		fs.writeFileSync(`${openapiResourceDir}/openapi.json`, JSON.stringify(api, undefined, 2)); 
    }

    deleteZipFile(){
		fsy.unlinkSync(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/apiproxy.zip`);
    }

    copyPoliciesTemplate(){
    	if (!this.answers.applyPolicies)
    		return;
	     this.fs.copyTpl(
	        this.templatePath('policies'),
	        this.destinationPath(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/apiproxy/policies`),
	        {}
	     );
	     this.fs.commit(()=>{});
    }

    setDescription(){
    	let srcDocument = this.fs.read(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/apiproxy/${this.answers.name}-${this.answers.version}.xml`);
    	let doc = new DOMParser().parseFromString(srcDocument);
        let nodes = xpath.select("/APIProxy/Description", doc);
        nodes[0].textContent = "@description"; //will be used by pom to replace
	    this.fs.write(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/apiproxy/${this.answers.name}-${this.answers.version}.xml`, doc.toString());
	    this.fs.commit(()=>{});
    }

    setBasePath(){
    	let srcDocument = this.fs.read(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/apiproxy/proxies/default.xml`);
    	let doc = new DOMParser().parseFromString(srcDocument);
        let nodes = xpath.select("/ProxyEndpoint/HTTPProxyConnection/BasePath", doc);
        nodes[0].textContent = this.answers.basePath;
	    this.fs.write(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/apiproxy/proxies/default.xml`, doc.toString());
	    this.fs.commit(()=>{});
    }

    removeVirtualhost(){
    	let srcDocument = this.fs.read(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/apiproxy/proxies/default.xml`);
    	let doc = new DOMParser().parseFromString(srcDocument);
        let nodes = xpath.select("/ProxyEndpoint/HTTPProxyConnection/VirtualHost", doc);
        doc.removeChild(nodes[0]); //default
        doc.removeChild(nodes[1]); //secure
	    this.fs.write(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/apiproxy/proxies/default.xml`, doc.toString());
	    this.fs.commit(()=>{});
    }

    setTargetServer(){
    	let srcDocument = this.fs.read(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/apiproxy/targets/default.xml`);
    	let doc = new DOMParser().parseFromString(srcDocument);
    	
    	let nodes = xpath.select("/TargetEndpoint/HTTPTargetConnection/URL", doc);
    	nodes[0].textContent = this.answers.targetUrl;
    	
    	/*
    	//Remove <URL/>
    	let nodes = xpath.select("/TargetEndpoint/HTTPTargetConnection/URL", doc);
    	doc.removeChild(nodes[0]);

    	//Add Target Server
    	let loadBalancer = doc.createElement('LoadBalancer');
    	let targetObj = doc.getElementsByTagName("HTTPTargetConnection")[0];
    	targetObj.appendChild(loadBalancer);

		//Add Servers
		let targetServers = this.answers.targetServer.split(",");
		for (var i = 0; i < targetServers.length; i++) {
			let server = doc.createElement('Server');
    		let loadBalancerObj = doc.getElementsByTagName("LoadBalancer")[0];
			loadBalancerObj.appendChild(server);

    		let serverObj = doc.getElementsByTagName("Server")[i];
			serverObj.setAttribute("name", targetServers[i].trim());
    	}
		*/
    	this.fs.write(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/apiproxy/targets/default.xml`, xmlFormatter(doc.toString()));
  		this.fs.commit(()=>{});
    }

    copyConfigResources(){
	     this.fs.copyTpl(
	        this.templatePath('resources'),
	        this.destinationPath(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/resources`),
	        {name : this.answers.name, version: this.answers.version}
	     );
	     this.fs.commit(()=>{});
    }

    copyTestTemplate(){
	     this.fs.copyTpl(
	        this.templatePath('tests'),
	        this.destinationPath(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/tests`),
	        {name : this.answers.name, version: this.answers.version}
	     );
	     this.fs.commit(()=>{});
    }

    copyPomTemplate(){
	     this.fs.copyTpl(
	        this.templatePath('pom.xml'),
	        this.destinationPath(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/pom.xml`),
	        {name : this.answers.name, version: this.answers.version, basePath: this.answers.basePath, northboundDomain: this.answers.northboundDomain}
	     );
	     this.fs.copyTpl(
	        this.templatePath('cloudbuild-pom.xml'),
	        this.destinationPath(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/cloudbuild-pom.xml`),
	        {name : this.answers.name, version: this.answers.version, basePath: this.answers.basePath, northboundDomain: this.answers.northboundDomain}
	     );
	     this.fs.commit(()=>{});
    }

    copyOtherTemplates(){
    	this.fs.copyTpl(
	        this.templatePath('cloudbuild.yaml'),
	        this.destinationPath(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/cloudbuild.yaml`),
	        {name : this.answers.name, version: this.answers.version}
	     );
	     this.fs.copyTpl(
	        this.templatePath('gitignore.txt'),
	        this.destinationPath(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/.gitignore`),
	        {name : this.answers.name, version: this.answers.version}
	     );
	     this.fs.copyTpl(
	        this.templatePath('.eslintrc.yml'),
	        this.destinationPath(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/.eslintrc.yml`),
	        {name : this.answers.name, version: this.answers.version}
	     );
	     this.fs.copyTpl(
	        this.templatePath('.eslintrc-jsc.yml'),
	        this.destinationPath(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/.eslintrc-jsc.yml`),
	        {name : this.answers.name, version: this.answers.version}
	     );
	     this.fs.copyTpl(
	        this.templatePath('Jenkinsfile'),
	        this.destinationPath(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/Jenkinsfile`),
	        {name : this.answers.name, version: this.answers.version}
	     );
	     this.fs.copyTpl(
	        this.templatePath('Dockerfile'),
	        this.destinationPath(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/Dockerfile`),
	        {name : this.answers.name, version: this.answers.version}
	     );
	     this.fs.copyTpl(
	        this.templatePath('README.md'),
	        this.destinationPath(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/README.md`),
	        {name : this.answers.name, version: this.answers.version}
	     );
	     this.fs.commit(()=>{});
    }

    copyPackageJsonTemplate(){
	     this.fs.copyTpl(
	        this.templatePath('packagejson.txt'),
	        this.destinationPath(`${this.answers.destination}/${this.answers.name}-${this.answers.version}/package.json`),
	        {name : this.answers.name, version: this.answers.version}
	     );
	     this.fs.commit(()=>{});
    }

    setDefaultPolicies(){
    	if (!this.answers.applyPolicies)
    		return;
    	var filePath = `${this.answers.destination}/${this.answers.name}-${this.answers.version}/apiproxy/proxies/default.xml`;
	  	fs.readFile(filePath, function(err, data) {
	  		parser.parseString(data, function (err, result) {
	  			//Add FC-Security and OAS-Validation to Preflow - Request
				result.ProxyEndpoint.PreFlow[0].Request[0] = [{"Step":{"Name": "FC-Security", "Condition":["request.verb != \"OPTIONS\""]}}, {"Step":{"Name": "OAS-Validation", "Condition":["request.verb != \"OPTIONS\""]}}];
				//Add FC-LogHandling to Postflow - Response
				result.ProxyEndpoint.PostFlow[0].Response[0] = {"Step":{"Name": "FC-LogHandling"}};
				//Add FC-FaultHandling to FaultRules
				result.ProxyEndpoint.FaultRules = {};
				result.ProxyEndpoint.DefaultFaultRule = {"$":{"name":"all"},"AlwaysEnforce":true,"Step":{"Name":"FC-FaultHandling"}};
				//Add CORS Flow
				let corsStep = {"$":{"name":"CORS"},"Description":["ignore OPTIONS request"], "Request":[""], "Response":[""], "Condition":["(proxy.pathsuffix MatchesPath \"/**\") and (request.verb = \"OPTIONS\")"]};
				result.ProxyEndpoint.Flows[0].Flow.push(corsStep);
				//Add Catch-All Flow
				let catchAllStep = {"$":{"name":"catch-all"},"Description":["Catch any unmatched calls and raise fault (must be the last flow)"], "Request":[{"Step":{"Name":"RF-PathNotFound"}}],"Response":[""], "Condition":["(proxy.pathsuffix MatchesPath \"/**\")"]};
				result.ProxyEndpoint.Flows[0].Flow.push(catchAllStep);
				//Add NoRoute Rule
				let defaultRule = result.ProxyEndpoint.RouteRule[0];
				let noRouteRule = { "$": { name: "cors" }, Condition:[ "(request.verb == \"OPTIONS\")"]};
				result.ProxyEndpoint.RouteRule = [noRouteRule, defaultRule];

	  			let xml = builder.buildObject(result);
	  			fs.writeFile(filePath, xml, function(err, data){
		            if (err) console.log(err);
		        });
	  		});
	  	});
    }

    generateOattsTests(){
	    this.log('Generating tests...');
	    this.spawnCommandSync('oatts',
      		['generate', 
      			'-s', `${this.answers.destination}/${this.answers.name}-${this.answers.version}/openapi/openapi.json`,
      			'--scheme', 'https', 
      			'-w', `${this.answers.destination}/${this.answers.name}-${this.answers.version}/tests/dev-integration`,
      			'--host', `${this.answers.northboundDomain}${this.answers.basePath}`,
      			]);
      	this.log('Tests Generated');
    }

    print(){
    	let absolutePath = path.resolve(`${this.answers.destination}/${this.answers.name}-${this.answers.version}`);
    	this.log(`APIProxy created - ${absolutePath}`);
    }
};
