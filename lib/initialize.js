var async = require('async');
var auxF = require('./functions');
var debug = require('debug')('sails:hook:sanseed');
var faker = require('faker');

module.exports = function(cb) {       
  sails.after(['hook:orm:loaded', 'hook:policies:loaded'], function() {
    function mapCreate (modelSeed, name, done) {
      if(!modelSeed.scheme.length){
        var fakerScheme = modelSeed.scheme;
        modelSeed.scheme = [];       
        if(fakerScheme.faker){
          var limit = 0;
          if(fakerScheme.faker.locale) faker.locale = fakerScheme.faker.locale;
          if(fakerScheme.faker.quantity) limit = fakerScheme.faker.quantity;
          var keys = Object.keys(fakerScheme.faker.format);
          for(var i = 0; i < limit; i++){
            var jsonData = {};              
            for(var j = 0; j < keys.length; j++){
              jsonData[keys[j]] = faker.fake(fakerScheme.faker.format[keys[j]]);
            }
            modelSeed.scheme.push({data: jsonData});
          }
        }
      }
      async.mapLimit(modelSeed.scheme, 1, function(item, next) {
        var next2 = next;
        if(modelSeed.migrate==='safe') next2 = function(err) {
          debug(err);
          next();
        };
        if(!sails.models[name]) return next2(new Error('Model '+name+" undefined"));
        else async.map(
          Object.keys(item.oneTo || {}),
          function(itemRelation, cbMap) {
            var modelAssociations = sails.models[name].associations;
            return sails.models[modelName(modelAssociations, itemRelation)].find(item.oneTo[itemRelation]).limit(1).exec(function(err, associatedModels) {
              if(!err || associatedModels!==[]){
                item.data[itemRelation] = associatedModels[0].id;
              }
              return cbMap();
            });
          }, function() {
            return sails.models[name].create(item.data, function(err, recordCreated) {
              if(err) next2(err);
              else async.mapLimit(
                Object.keys(item.manyTo || {}), 1,
                function(itemRelation, cbMap) {
                  var modelAssociations = sails.models[name].associations;
                  return sails.models[modelName(modelAssociations, itemRelation)].find({or: item.manyTo[itemRelation]}).exec(function(err, associatedModels) {
                    if(!err || associatedModels!==[]){
                      for(var j=0; j<associatedModels.length; j++){
                        recordCreated[itemRelation].add(associatedModels[j].id);
                      }
                    }
                    recordCreated.save(cbMap);
                  });
                },
                next2
              );
            });
          }
        );
      }, done);
    }
    function seedModel(seed, name, done) {
      var checkModel = !sails.config.seed.databases;
      checkModel = checkModel || !sails.config.seed.databases[seed];
      if(checkModel) return done(new Error('Location missing'));          
      var modelSeed = sails.config.seed.databases[seed][name];
      if(modelSeed===null || modelSeed===undefined){
        return done(new Error('missing model'));
      }else{
        if(modelSeed.migrate==="drop") dropModel(name, function(err) {
          if(err) return done(err);
          else return mapCreate(modelSeed, name, done);
        });
        else return mapCreate(modelSeed, name, done);
      }
    }
    function dropModel (name, done) {
      sails.models[name].destroy({}, done);
    }
    sails.seed = {
      seedAll : function (name, done) {
        if(!sails.config.seed.databases){
          return done(new Error('Location missing'));
        }
        var seed = sails.config.seed.databases[name];
        if(seed===null || seed===undefined){
          return done(new Error('Seed not found'));
        }else return async.mapLimit(
          Object.keys(seed), 
          1, 
          function(item, next){
            seedModel(name, item, next);
          },
          done
        );
      },
      seedModel: seedModel,
      dropModel: dropModel,
      dropAll: function(done) {
        var modelKeys = Object.keys(sails.models);
        async.mapLimit(modelKeys, 1, function(item, next) {
          dropModel(item, next);
        }, done);
      }
    };
    sails.hooks.policies.middleware.seedall = auxF.seedAllReq;
    sails.hooks.policies.middleware.seedall.identity = "seedall";
    sails.hooks.policies.middleware.seedall.globalId = "seedAll";
    sails.hooks.policies.middleware.seedall.sails = sails;

    sails.hooks.policies.middleware.seedmodel = auxF.seedModelReq;
    sails.hooks.policies.middleware.seedmodel.identity = "seedmodel";
    sails.hooks.policies.middleware.seedmodel.globalId = "seedModel";
    sails.hooks.policies.middleware.seedmodel.sails = sails;

    sails.hooks.policies.middleware.dropall = auxF.dropAllReq;
    sails.hooks.policies.middleware.dropall.identity = "dropall";
    sails.hooks.policies.middleware.dropall.globalId = "dropAll";
    sails.hooks.policies.middleware.dropall.sails = sails;

    sails.hooks.policies.middleware.dropmodel = auxF.dropModelReq;
    sails.hooks.policies.middleware.dropmodel.identity = "dropmodel";
    sails.hooks.policies.middleware.dropmodel.globalId = "dropModel";
    sails.hooks.policies.middleware.dropmodel.sails = sails;
    return cb();
  });
};

function modelName(modelAssociations, itemRelation) {
  for(var i=0; i<modelAssociations.length; i++){
    if(modelAssociations[i].alias === itemRelation){
      return modelAssociations[i][modelAssociations[i].type];
    }
  }
}