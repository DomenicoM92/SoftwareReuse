//database access
var neo4j = require('neo4j-driver').v1;
var driver = neo4j.driver('bolt://localhost',neo4j.auth.basic('neo4j','123456'));
var session = driver.session();
//for handle file system
var fs = require('fs');
var paths= require('../paths-manager');
var newPath;
//fields sent from form
var idProject,name,description,note,version,uri,entry_point,tags,author,technology,granularity,domain;
//for run child process
var exec = require('child_process').exec, child;

module.exports.createProjectNode = function (files,fields) {
    newPath =  paths.projectsRepoPATH+files.filetoupload.name;
    name = fields.name;
    description = fields.description;
    note = fields.note;
    version = fields.version;
    uri = fields.uri;
    entry_point = fields.entry_point;
    author = fields.author;
    technology = fields.technology;
    domain = fields.domain;

    //WRITE FILE
    writeDomainValues(fields);
    
    idProject = makeid();
    console.log("-Start to load component into Neo4j DB");
    //insert project unzip into neo4j
    session.run('MERGE(Project:'+idProject+' {Path:'+"'"+newPath+"'"+', Name:'+"'"+name+"'"+', Description:'+"'"+description+"'"+', Note:'+"'"+note+"'"+', Version:'+"'"+version+"'"+', Uri:'+"'"+uri+"'"+', Entry_point:'+"'"+entry_point+"'"+', Tags:'+"'"+tags+"'"+', Author:'+"'"+author+"'"+', Technology:'+"'"+technology+"'"+', Granurality:'+"'"+granularity+"'"+', Domain:'+"'"+domain+"'"+'})')
    .catch( function(error) {
        console.log(error);
        driver.close();
    });
    console.log("-Node project stored correctly");
}

module.exports.doSaveSourceFile = function (cls,dependencies) {
    var nameComponentClass;
    var nameComponentDepen;
    var indexForChangeNameDep = [];
    //insert nodeClass
    for(i= 0, k = 0; i < cls.length; k++,i++) {
        nameComponentClass = "NODE"+i;
        session.run('MERGE(n:'+nameComponentClass+' {Class_Path: '+"'"+cls[i]+"'"+', Project_Path:'+"'"+newPath+"'"+'})')
        .catch( function(error) {
        console.log(error);
        driver.close();
        });
        for (j = 0; j < dependencies[k].length; j++) {
        nameComponentDepen = "NODE"+k+j;
        indexForChangeNameDep.push(nameComponentDepen);
        //insert nodeDep
        session
        .run('MERGE(n:'+nameComponentDepen+' {Class_Path: '+"'"+dependencies[k][j]+"'"+', Project_Path:'+"'"+newPath+"'"+'})')
        .catch( function(error) {
            console.log(error);
            driver.close();
        });
        //Create relation Class --> Dependencies
        session
        .run('MATCH (c:'+nameComponentClass+'), (d:'+nameComponentDepen+') MERGE (c)-[u:USE]->(d)')
        .catch( function(error) {
            console.log(error);
            driver.close();
        });
        }
        //set unique name for node Class in Neo4j
        session
        .run('MATCH (n:'+nameComponentClass+') SET n:'+makeid()+' REMOVE n:'+nameComponentClass+"")
        .catch( function(error) {
        console.log(error);
        driver.close();
        });
    }
    //set unique name dependencies in neo4j
    for(i = 0; i < indexForChangeNameDep.length; i++) {
        session
        .run('MATCH (n:'+indexForChangeNameDep[i]+') SET n:'+makeid()+' REMOVE n:'+indexForChangeNameDep[i]+"")
        .catch( function(error) {
        console.log(error);
        driver.close();
        });
    }
    console.log("-Source Files stored correctly");
} 
module.exports.doSaveDocuments = function (documents) {
    
    for(i = 0; i < documents.length; i++) {
        var idDocumentation = makeid();
        session.run('MATCH(Project:'+idProject+') MERGE(Document:'+idDocumentation+' {pathDocument:'+"'"+documents[i]+"'"+', type:"documentation"}) MERGE (Project)-[r:hasDocumentation]->(Document)')
        .catch( function(error) {
            console.log(error);
            driver.close();
        }); 
    }
    console.log("-Docs stored correctly");

}
module.exports.doSaveTestFile = function (tests) {
    for(i = 0; i < tests.length; i++) {
        var idTests = makeid();
        session.run('MATCH(Project:'+idProject+') MERGE(Test:'+idTests+' {pathTestFile:'+"'"+tests[i]+"'"+', type:"test"}) MERGE (Project)-[r:hasTest]->(Test)')
        .catch( function(error) {
            console.log(error);
            driver.close();
        }); 
    }  
    console.log("-Test files stored correctly");

}
module.exports.endOperations = function (res) {
	res.writeHead(301, {Location: "/"});
    res.end();
}

/*This function make an ID for any node that must be stored into DB. */
function makeid() {
	// return IDString UNIQUE
	var text = "";
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
	for (var i = 0; i < 5; i++)
	    text += possible.charAt(Math.floor(Math.random() * possible.length));
	
	return text;
}


function writeDomainValues(fields){
	fs.writeFile("../repository/values.txt",
    		"Name:"+name+"\n" +
			"Description:"+description+"\n" +
			"Note:"+note+"\n" +
			"Version:"+version+"\n" +
			"URI:"+uri+"\n" +
			"EntryPoint:"+entry_point+"\n" +
			"Author:"+author+"\n" +
			"Technology:"+technology+"\n" +
			"Domain:"+domain+"\n", function(err){
    	if(err){
    		console.log(err);
    	}
    });
    console.log("File Value for Ontology written correctly");
    updateOntology(fields);
}

function updateOntology(fields) {
    //run ONTUpdater
    //@PARAMS path of values file (values file is the schema Key:Value for build ontology)
    //@RETURN ontology file into ont_repository
    child = exec('java -jar '+paths.externalToolsPATH+'ONTUpdater.jar '+paths.projectsRepoPATH+'values.txt '+paths.rootPATH+"ont_repository/"+fields.name,
        function (error, stdout, stderr){
            console.log('stdout: ' + stdout);
            console.log('stderr: ' + stderr);
            if(error)
                console.log(error);
            uploadOntologyFile(fields);    
        });
}

function uploadOntologyFile(fields) {
    var nameWithoutSpaces = fields.name.replace(/\s/g,'');
    var nameOntology = fields.name.split(" ");    
    fs.rename(paths.rootPATH+"ont_repository/"+nameOntology[0], paths.rootPATH+"ont_repository/"+nameWithoutSpaces+".owl", function(err) {
        if ( err ) 
            console.log(err);
    });    
    //run FusekiUploader
    //@PARAMS path of ontology file
    //@RETURN void
    child = exec('java -jar '+paths.externalToolsPATH+'FusekiUpload.jar '+paths.rootPATH+"ont_repository/"+nameWithoutSpaces+".owl",
        function (error, stdout, stderr){
            console.log('stdout: ' + stdout);
            console.log('stderr: ' + stderr);
            if(error)
                console.log(error);
            else
                console.log("END UPLOAD");    
        });
}