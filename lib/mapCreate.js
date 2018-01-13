const  _ = require("lodash"),
  faker = require("faker"),
  map = require("async/map"),
  mapLimit = require("async/mapLimit"),
  modelName = require("./modelName"),
  safeCb = require("./safeCb");

const fakkerJson = (schemeForm) => {
  return (typeof schemeForm === "string") ? 
    faker.fake(schemeForm) :
    schemeForm;
};

module.exports =  (sails) => (modelSeed, name, done) => {
  if(modelSeed.faker){
    let fakerScheme = modelSeed.faker;
    modelSeed.scheme = [];
    const limit = (fakerScheme.quantity) ? fakerScheme.quantity : 1;
    faker.locale = fakerScheme.locale ? fakerScheme.locale : "es";
    modelSeed.scheme = _.map(Array(limit), () => {
      let jsonData = {};
      _.forEach(fakerScheme.format, (schemeForm, key) => {
        jsonData[key] = fakkerJson(schemeForm);
      });
      return {data: jsonData, oneTo: fakerScheme.oneTo, manyTo: fakerScheme.manyTo};
    });
  }
  mapLimit(modelSeed.scheme, 1, (item, next) => {
    const next2 = safeCb(modelSeed.migrate, next);
    return (!sails.models[name]) ? 
      next2(new Error("Model "+name+" undefined")) :
      map(
        Object.keys(item.oneTo || {}),
        (itemRelation, cbMap) => {
          var modelAssociations = sails.models[name].associations;
          let modelN = modelName(modelAssociations, itemRelation);
          return modelN !== null ? sails.models[modelN].find(item.oneTo[itemRelation]).limit(1).exec((err, associatedModels) => {
              if(!err && associatedModels.length!==0){
                item.data[itemRelation] = associatedModels[0].id;
              }
              return cbMap();
            })
            : cbMap();
        }, 
        () => {
          if(item.faker){
            _.forEach(item.faker, (fakeAttribute, key) => {
              item.data[key] = faker.fake(fakeAttribute);
            });
          }
          return sails.models[name].create(item.data).fetch().exec((err, recordCreated) => {
            let parentModelName = name;
            let parentRecord = recordCreated;            
            return err ? 
              next2(err):
              mapLimit(
                Object.keys(item.manyTo || {}), 
                1,
                (itemRelation, cbMap) => {
                  var modelAssociations = sails.models[name].associations;
                  let model = modelName(modelAssociations, itemRelation);
                  return model !== null ? 
                    sails.models[model].find({or: item.manyTo[itemRelation]}).exec((err, associatedModels) => {
                      if(!err || associatedModels!==[]){
                        let membersArr = [];                        
                        _.forEach(associatedModels, (associatedModel) => {                          
                          membersArr.push(associatedModel.id);                          
                        });
                        sails.models[parentModelName].addToCollection(parentRecord.id, itemRelation).members(membersArr).then(() => {
                          cbMap();
                        });
                      } else cbMap();
                    }) :
                    cbMap();
                },
                next2
              );
          });
        }
    );
  }, done);
};
