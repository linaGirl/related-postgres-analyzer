(function() {
	'use strict';

	var   Class 		= require('ee-class')
		, log 			= require('ee-log')
        , type          = require('ee-types')
        , QueryContext  = require('related-query-context')
        ;






	module.exports = new Class({



		init: function(connection) {
            this.connection = connection;
		}



        /**
         * analyze all dbs available dbs on the connection
         *
         * @returns {Promise} a promise
         */
        , analyze: function(schemas, callback) {
           
            var config = this.connection.getConfig();


            return Promise.all(schemas.map(function(schemaName) {
                return Promise.all(['listContraints', 'describeTables', 'schemaExists'].map(function(fn) {
                    return this[fn](schemaName);
                }.bind(this))).then(function(results) {
                    return Promise.resolve({
                          databaseName: schemaName
                        , constraints:  results[0]
                        , tables:       results[1]
                        , exists:       results[2]
                    });
                }.bind(this));
            }.bind(this))).then(function(definitions) {
                var dbs = {};

                definitions.forEach(function(db){
                    var database;

                    if (!dbs[db.databaseName]) {
                        dbs[db.databaseName] = {};
                        Object.defineProperty(dbs[db.databaseName], 'getDatabaseName', {
                            value: function(){return db.databaseName;}
                        });
                        Object.defineProperty(dbs[db.databaseName], 'schemaExists', {
                            value: function(){return db.exists;}
                        });
                        Object.defineProperty(dbs[db.databaseName], 'getDatabaseAliasName', {
                            value: function(){return config.alias;}
                        });
                    }
                    database = dbs[db.databaseName];


                    // map tables
                    db.tables.forEach(function(definition){
                        var table;

                        if (!database[definition.table_name]) {
                            database[definition.table_name] = {
                                  name          : definition.table_name
                                , primaryKeys   : []
                                , isMapping     : false
                                , columns       : {}
                            };

                            Object.defineProperty(database[definition.table_name], 'getTableName', {
                                value: function(){return definition.table_name;}
                            });
                            Object.defineProperty(database[definition.table_name], 'getDatabaseName', {
                                value: function(){return db.databaseName;}
                            });
                            Object.defineProperty(database[definition.table_name], 'getDatabaseAliasName', {
                                value: function(){return config.alias;}
                            });
                        }
                        table = database[definition.table_name];

                        // build type object
                        table.columns[definition.column_name] = this._mapTypes(definition);
                    }.bind(this));

                    // log(database);

                    // map constraints
                    Object.keys(db.constraints).forEach(function(tableName){

                        // gather info
                        Object.keys(db.constraints[tableName]).forEach(function(constraintName){
                            var   constraint = db.constraints[tableName][constraintName];


                            constraint.rules.forEach(function(rule){
                                switch (constraint.type) {
                                    case 'primary key':
                                        database[tableName].columns[rule.column_name].isPrimary = true;
                                        database[tableName].primaryKeys.push(rule.column_name);
                                        break;

                                    case 'unique':
                                        database[tableName].columns[rule.column_name].isUnique = true;
                                        break;

                                    case 'foreign key':
                                        database[tableName].columns[rule.column_name].isForeignKey = true;
                                        database[tableName].columns[rule.column_name].referencedTable = rule.referenced_table_name;
                                        database[tableName].columns[rule.column_name].referencedColumn = rule.referenced_column_name;
                                        database[tableName].columns[rule.column_name].referencedModel = database[rule.referenced_table_name];

                                        database[tableName].columns[rule.column_name].referenceUpdateAction = rule.on_update.toLowerCase();
                                        database[tableName].columns[rule.column_name].referenceDeleteAction = rule.on_delete.toLowerCase();


                                        // tell the other side its referenced
                                        database[rule.referenced_table_name].columns[rule.referenced_column_name].belongsTo.push({
                                              targetColumn: rule.column_name
                                            , name: tableName
                                            , model: database[tableName]
                                        });
                                        database[rule.referenced_table_name].columns[rule.referenced_column_name].isReferenced = true;
                                        break;
                                }
                            });
                        }.bind(this));


                        Object.keys(db.constraints[tableName]).forEach(function(constraintName){
                            var   constraint = db.constraints[tableName][constraintName];

                            // check for mapping table
                            // a rule must have two memebers and may be of type primary
                            // or unique. if this rule has fks on both column we got a mapping table
                            if (constraint.rules.length === 2 && (constraint.type === 'primary key' || constraint.type === 'unique')){
                                var columns = constraint.rules.map(function(rule){ return rule.column_name; });

                                // serach for fks on both columns, go through all rules on the table, look for a fk constraint
                                if (Object.keys(db.constraints[tableName]).filter(function(checkContraintName){
                                            var checkConstraint = db.constraints[tableName][checkContraintName];

                                            return checkConstraint.type === 'foreign key' && (checkConstraint.rules.filter(function(checkRule){
                                                return columns.indexOf(checkRule.column_name) >= 0;
                                            })).length === 1;
                                        }).length === 2){

                                    database[tableName].isMapping = true;
                                    database[tableName].mappingColumns = columns;

                                    // set mapping reference on tables
                                    var   modelA = database[tableName].columns[columns[0]].referencedModel
                                        , modelB = database[tableName].columns[columns[1]].referencedModel;

                                    modelA.columns[database[tableName].columns[columns[0]].referencedColumn].mapsTo.push({
                                          model         : modelB
                                        , column        : modelB.columns[database[tableName].columns[columns[1]].referencedColumn]
                                        , name          : modelB.name
                                        , via: {
                                              model     : database[tableName]
                                            , fk        : columns[0]
                                            , otherFk   : columns[1]
                                        }
                                    });

                                    // don't add mappings to myself twice
                                    if (modelB !== modelA) {
                                        modelB.columns[database[tableName].columns[columns[1]].referencedColumn].mapsTo.push({
                                              model         : modelA
                                            , column        : modelA.columns[database[tableName].columns[columns[0]].referencedColumn]
                                            , name          : modelA.name
                                            , via: {
                                                  model     : database[tableName]
                                                , fk        : columns[1]
                                                , otherFk   : columns[0]
                                            }
                                        });
                                    }
                                }
                            }
                        }.bind(this));
                    }.bind(this));
                }.bind(this));

    
                return Promise.resolve(dbs);
            }.bind(this));
        }






        /*
         * translate pg type definition to standard orm type definition
         *
         * @param <Object> pg column description
         *
         * @returns <Object> standardized type object
         */
        , _mapTypes: function(pgDefinition) {
            var ormType = {};

            // column identifier
            ormType.name = pgDefinition.column_name;



            // type conversion
            switch (pgDefinition.data_type) {
                case 'integer':
                case 'bigint':
                case 'smallint':
                    ormType.type            = 'integer';
                    ormType.jsTypeMapping   = 'number';
                    ormType.bitLength       = pgDefinition.numeric_precision;
                    ormType.variableLength  = false;
                    if (type.string(pgDefinition.column_default)) {
                        if (/nextval\(.*\:\:regclass\)/gi.test(pgDefinition.column_default)) ormType.isAutoIncrementing = true;
                        else if (/[^0-9]+/gi.test(pgDefinition.column_default)) ormType.defaultValue = pgDefinition.column_default;
                        else ormType.defaultValue = parseInt(pgDefinition.column_default, 10);
                    }
                    break;

                case 'bit':
                    ormType.type            = 'bit';
                    ormType.jsTypeMapping   = 'arrayBuffer';
                    ormType.variableLength  = false;
                    ormType.bitLength       = pgDefinition.character_maximum_length;
                    break;

                case 'bit varying':
                    ormType.type            = 'bit';
                    ormType.jsTypeMapping   = 'arrayBuffer';
                    ormType.variableLength  = true;
                    ormType.maxBitLength    = pgDefinition.character_maximum_length;
                    break;

                case 'boolean':
                    ormType.type            = 'boolean';
                    ormType.jsTypeMapping   = 'boolean';
                    break;

                case 'character':
                    ormType.type            = 'string';
                    ormType.jsTypeMapping   = 'string';
                    ormType.variableLength  = false;
                    ormType.length          = pgDefinition.character_maximum_length;
                    break;

                case 'character varying':
                case 'text':
                    ormType.type            = 'string';
                    ormType.jsTypeMapping   = 'string';
                    ormType.variableLength  = true;
                    ormType.maxLength       = pgDefinition.character_maximum_length;
                    break;

                case 'json':
                    ormType.type            = 'json';
                    ormType.jsTypeMapping   = 'json';
                    ormType.variableLength  = true;
                    ormType.bitLength       = pgDefinition.character_maximum_length;
                    break;

                case 'date':
                    ormType.type            = 'date';
                    ormType.jsTypeMapping   = 'date';
                    ormType.variableLength  = false;
                    break;

                case 'double precision':
                    ormType.type            = 'float';
                    ormType.jsTypeMapping   = 'number';
                    ormType.variableLength  = false;
                    ormType.bitLength       = pgDefinition.numeric_precision;
                    break;

                case 'numeric':
                case 'decimal':
                    ormType.type            = 'decimal';
                    ormType.jsTypeMapping   = 'string';
                    ormType.variableLength  = false;
                    ormType.length          = pgDefinition.numeric_precision;
                    break;

                case 'real':
                    ormType.type            = 'float';
                    ormType.jsTypeMapping   = 'number';
                    ormType.variableLength  = false;
                    ormType.bitLength       = pgDefinition.numeric_precision;
                    break;

                case 'time without time zone':
                    ormType.type            = 'time';
                    ormType.withTimeZone    = false;
                    ormType.jsTypeMapping   = 'string';
                    break;

                case 'time with time zone':
                    ormType.type            = 'time';
                    ormType.withTimeZone    = true;
                    ormType.jsTypeMapping   = 'string';
                    break;

                case 'timestamp without time zone':
                    ormType.type            = 'datetime';
                    ormType.withTimeZone    = false;
                    ormType.jsTypeMapping   = 'date';
                    break;

                case 'timestamp with time zone':
                    ormType.type            = 'datetime';
                    ormType.withTimeZone    = true;
                    ormType.jsTypeMapping   = 'date';
                    break;
            }



            // is null allowed
            ormType.nullable = pgDefinition.is_nullable === 'YES';

            // autoincrementing?
            if (!ormType.isAutoIncrementing) ormType.isAutoIncrementing = false;

            // has a default value?
            if (type.undefined(ormType.defaultValue)) {
                if (type.string(pgDefinition.column_default)) ormType.defaultValue = pgDefinition.column_default;
                else ormType.defaultValue = null;
            }

            // will be set later
            ormType.isPrimary       = false;
            ormType.isUnique        = false;
            ormType.isReferenced    = false;
            ormType.isForeignKey    = false;

            // the native type, should not be used by the users, differs for every db
            ormType.nativeType = pgDefinition.data_type;

            // will be filled later
            ormType.mapsTo          = [];
            ormType.belongsTo       = [];

            return ormType;
        }







        /**
         * list all constraints for a database
         *
         * @param {string} databaseName the name of the database 
         *
         * @returns {Promise} a promise     
         */
        , listContraints: function(databaseName) {
            return Promise.all([`   
                SELECT tc.table_name, 
                       kcu.column_name, 
                       tc.constraint_type, 
                       tc.constraint_name,
                       tc.constraint_catalog,
                       (
                                  SELECT pkr.relname AS referenced_table_name 
                                    FROM pg_constraint c 
                                    JOIN pg_namespace cn 
                                      ON cn.oid = c.connamespace 
                                    JOIN pg_class fkr 
                                      ON fkr.oid = c.conrelid 
                                    JOIN pg_namespace fkn 
                                      ON fkn.oid = fkr.relnamespace 
                                    JOIN pg_attribute fka 
                                      ON fka.attrelid = c.conrelid 
                                     AND fka.attnum = ANY(c.conkey) 
                                    JOIN pg_class pkr 
                                      ON pkr.oid = c.confrelid 
                                    JOIN pg_namespace pkn 
                                      ON pkn.oid = pkr.relnamespace 
                                    JOIN pg_attribute pka 
                                      ON pka.attrelid = c.confrelid 
                                     AND pka.attnum = ANY(c.confkey) 
                                   WHERE c.contype = 'f'::"char" 
                                     AND pkn.nspname = '${databaseName}'
                                     AND fkr.relname = tc.table_name 
                                     AND fka.attname = kcu.column_name 
                                     AND c.conname = kcu.constraint_name 
                                   LIMIT 1
                        ) referenced_table_name, 
                        (
                                  SELECT pka.attname AS referenced_column_name 
                                    FROM pg_constraint c 
                                    JOIN pg_namespace cn 
                                      ON cn.oid = c.connamespace 
                                    JOIN pg_class fkr 
                                      ON fkr.oid = c.conrelid 
                                    JOIN pg_namespace fkn 
                                      ON fkn.oid = fkr.relnamespace 
                                    JOIN pg_attribute fka 
                                      ON fka.attrelid = c.conrelid 
                                     AND fka.attnum = ANY(c.conkey) 
                                    JOIN pg_class pkr 
                                      ON pkr.oid = c.confrelid 
                                    JOIN pg_namespace pkn 
                                      ON pkn.oid = pkr.relnamespace 
                                    JOIN pg_attribute pka 
                                      ON pka.attrelid = c.confrelid 
                                     AND pka.attnum = ANY(c.confkey) 
                                   WHERE c.contype = 'f'::"char"
                                     AND pkn.nspname = '${databaseName}'
                                     AND fkr.relname = tc.table_name 
                                     AND fka.attname = kcu.column_name 
                                     AND c.conname = kcu.constraint_name 
                                   LIMIT 1
                        ) referenced_column_name
                   FROM information_schema.table_constraints tc 
                   JOIN information_schema.key_column_usage kcu 
                     ON tc.constraint_name = kcu.constraint_name 
                    AND tc.table_name = kcu.table_name 
                  WHERE tc.constraint_schema = '${databaseName}' 
                    AND kcu.constraint_schema = '${databaseName}'
               ORDER BY tc.table_name, 
                        tc.constraint_name, 
                        tc.constraint_type;
            `, `                 
                 SELECT t.relname as table_name, 
                        a.attname as column_name, 
                        'UNIQUE' as constraint_type, 
                        i.relname as constraint_name, 
                        null as referenced_table_name, 
                        null as referenced_column_name 
                   FROM pg_class t, 
                        pg_class i, 
                        pg_index ix, 
                        pg_attribute a, 
                        pg_namespace n 
                  WHERE t.oid = ix.indrelid 
                    AND i.oid = ix.indexrelid 
                    AND a.attrelid = t.oid 
                    AND a.attnum = ANY(ix.indkey) 
                    AND t.relkind = 'r' 
                    AND ix.indisunique = true 
                    AND t.relnamespace = n.oid 
                    AND n.nspname = '${databaseName}' 
                    AND ix.indisprimary = false 
                    AND indnatts > 1 
               ORDER BY t.relname, 
                        i.relname;
            `, `
                  SELECT rc.update_rule on_update, rc.constraint_catalog, rc.constraint_name
                    FROM information_schema.referential_constraints rc
                   WHERE rc.constraint_schema = '${databaseName}'
            `, `
                  SELECT rc.delete_rule on_delete, rc.constraint_catalog, rc.constraint_name
                    FROM information_schema.referential_constraints rc
                   WHERE rc.constraint_schema = '${databaseName}'
            `].map((sql) => {
                return this.connection.query(sql);
            })).then((results) => {
                var   constraints = {}
                    , tables = {}
                    , handledConstraints = {};



                // this is faster than a subselect
                // create a map for the rules
                let updateMap = {};
                results[2].forEach((rule) => {
                    if (!updateMap[rule.constraint_catalog]) updateMap[rule.constraint_catalog] = {};
                    updateMap[rule.constraint_catalog][rule.constraint_name] = rule.on_update;
                });

                let deleteMap = {};
                results[3].forEach((rule) => {
                    if (!deleteMap[rule.constraint_catalog]) deleteMap[rule.constraint_catalog] = {};
                    deleteMap[rule.constraint_catalog][rule.constraint_name] = rule.on_delete;
                });


                // add the constraints to the rules
                results[0].forEach((constraint) => {
                    if (updateMap[constraint.constraint_catalog] && updateMap[constraint.constraint_catalog][constraint.constraint_name]) {
                        constraint.on_update = updateMap[constraint.constraint_catalog][constraint.constraint_name];
                    }

                    if (deleteMap[constraint.constraint_catalog] && deleteMap[constraint.constraint_catalog][constraint.constraint_name]) {
                        constraint.on_delete = deleteMap[constraint.constraint_catalog][constraint.constraint_name];
                    }
                });



                // join the separate results
                results[0].forEach((constraint) => {
                    // we are loading some constraints from the index table,
                    // make sure there are no duplicates
                    handledConstraints[constraint.constraint_name] = true;

                    if (!constraints[constraint.table_name]) constraints[constraint.table_name] = {};
                    if (!constraints[constraint.table_name][constraint.constraint_name]) constraints[constraint.table_name][constraint.constraint_name] = {rules: [], type: 'unknown'};

                    constraints[constraint.table_name][constraint.constraint_name].rules.push(constraint);
                    constraints[constraint.table_name][constraint.constraint_name].type = constraint.constraint_type.toLowerCase();
                });

                // cnstraints from uniue indexes
                results[1].forEach((constraint) => {
                    // we are loading some constraints from the index table,
                    // make sure there are no duplicates
                    if (!handledConstraints[constraint.constraint_name]) {
                        if (!constraints[constraint.table_name]) constraints[constraint.table_name] = {};
                        if (!constraints[constraint.table_name][constraint.constraint_name]) constraints[constraint.table_name][constraint.constraint_name] = {rules: [], type: 'unknown'};

                        constraints[constraint.table_name][constraint.constraint_name].rules.push(constraint);
                        constraints[constraint.table_name][constraint.constraint_name].type = constraint.constraint_type.toLowerCase();
                    }
                });

                return Promise.resolve(constraints);
            });
        }







        /**
         * checks is a given schema exists
         *
         * @param {string} schemaName the name of the schema 
         *
         * @returns {Promise} a promise         
         */
        , schemaExists: function(schemaName) {
            return this.connection.query(new QueryContext({
                sql: `SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname = '${schemaName}';`
            })).then(function(records) {
                return Promise.resolve(!!records.length);
            }.bind(this));
        }







        /**
         * fetches detailed data about all table of a database
         *
         * @returns {Promise} a promise
         */
        , describeTables: function(databaseName) {
            return this.connection.query(new QueryContext({
                sql: `SELECT "table_schema", "table_name", "column_name", "column_default", "is_nullable", "data_type", "character_maximum_length", "numeric_precision" FROM "information_schema"."columns" WHERE table_schema = '${databaseName}'`
            }));
        }






        /**
         * list all table object of for a specific database
         *
         * @param {string} databaseName the name of the database to list
         *                 the tables for
         *
         * @returns {Promise} a promise
         */
        , listTables: function(databaseName) {
            return this.connection.query(new QueryContext({sql: 'SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema = '+databaseName+' ORDER BY table_schema,table_name;', mode: 'query'}));
        }





        /**
         * lists all databases
         *
         * @returns {Promise} a promise
         */
        , listDatabases: function() {
            return this._query(new QueryContext({
                  sql: 'SELECT datname FROM pg_database WHERE datistemplate = false;'
            })).then(function(databases) {
                databases = (databases.rows || []).filter(function(row){
                    return row.datname !== 'information_schema';
                }).map(function(row){
                    return row.datname;
                })

                return Promise.resolve(databses);
            }.bind(this));
        }

	});
})();
