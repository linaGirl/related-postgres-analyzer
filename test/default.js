

	var   Class 		= require('ee-class')
		, log 			= require('ee-log')
        , DBConnection  = require('related-postgres-connection')
        , TestConfig    = require('test-config')
		, assert 		= require('assert')
        ;



	var   Analyzer = require('../')
        , connection
        , analyzer
        , config = new TestConfig('test-config.js', {
              database  : 'test'
            , host      : 'localhost'
            , username  : 'postgres'
            , password  : ''
            , port      : 5432
        })
        ;



    describe('Setting up the db', function() {
        it('should work', function(done) {
            connection = new DBConnection(config);

            connection.once('idle', done)

            connection.connect();
        });
    });


    describe('The analyzer', function() {
        it('should not crash when instantiated', function() {
            analyzer = new Analyzer(connection);
        });

        it('should return the dbs definition', function(done) {
            analyzer.analyze(['related_test_postgres_analyzer']).then(function(definition) {
                assert(definition && definition.related_test_postgres_analyzer && definition.related_test_postgres_analyzer.jsonType && definition.related_test_postgres_analyzer.getFunctions());
                done();
            }).catch(done);
        });
    });
