

DROP SCHEMA IF EXISTS related_test_postgres_analyzer CASCADE;
CREATE SCHEMA related_test_postgres_analyzer;



 SET search_path TO related_test_postgres_analyzer;




CREATE TABLE "jsonType" (
      "id"                          serial NOT NULL
    , "data"                        json
    , CONSTRAINT "pk_jsonType" PRIMARY KEY (id)
);


CREATE TABLE "typeTest" (
      "serial"                      serial
    , "bigserial"                   bigserial
    , "serial8"                     serial8
    , "bigint"                      bigint
    , "bigint_default"              bigint DEFAULT 6
    , "int8"                        int8
    , "int8_default"                int8 DEFAULT 6
    , "bit"                         bit
    , "bit_len"                     bit (69)
    , "bit_varying"                 bit varying
    , "bit_varying_len"             bit varying (69)
    , "varbit"                      varbit
    , "boolean"                     boolean
    , "boolean_default"             boolean DEFAULT TRUE
    , "bool"                        bool
    , "box"                         box
    , "bytea"                       bytea
    , "character"                   character
    , "character_len"               character (69)
    , "character_varying"           character varying
    , "character_varying_len"       character varying (69)
    , "cidr"                        cidr
    , "circle"                      circle
    , "date"                        date
    , "double_precision"            double precision
    , "float8"                      float8
    , "inet"                        inet
    , "integer"                     integer
    , "int"                         int
    , "int4"                        int4
    , "interval"                    interval
    , "json"                        json
    , "line"                        line
    , "lseg"                        lseg
    , "macaddr"                     macaddr
    , "money"                       money
    , "numeric"                     numeric
    , "numeric_len"                 numeric (10, 4)
    , "path"                        path
    , "point"                       point
    , "polygon"                     polygon
    , "real"                        real
    , "float4"                      float4
    , "smallint"                    smallint
    , "int2"                        int2
    , "smallserial"                 smallserial
    , "serial2"                     serial2
    , "text"                        text
    , "time"                        time
    , "timetz"                      timetz
    , "time_without_time_zone"      time without time zone
    , "time_with_time_zone"         time with time zone
    , "timestamp"                   timestamp
    , "timestamp_default"           timestamp DEFAULT now()
    , "timestamptz"                 timestamptz
    , "timestamp_with_time_zone"    timestamp with time zone
    , "timestamp_without_time_zone" timestamp without time zone
    , "tsquery"                     tsquery
    , "tsvector"                    tsvector
    , "txid_snapshot"               txid_snapshot
    , "uuid"                        uuid
    , "xml"                         xml
    , CONSTRAINT "pf_typeTest" PRIMARY KEY ("serial")
);





CREATE TABLE language (
      id                serial NOT NULL
    , code              character varying(2)
    , CONSTRAINT "pk_language" PRIMARY KEY (id)
    , CONSTRAINT "unique_language_code" UNIQUE (code)
);

CREATE TABLE image (
      id                serial NOT NULL
    , url               character varying(300)
    , CONSTRAINT "pk_image" PRIMARY KEY (id)
);


CREATE TABLE venue (
      id                serial NOT NULL
    , id_image          integer NOT NULL
    , id_municipality   integer NOT NULL
    , name              character varying(200)
    , CONSTRAINT "pk_venue" PRIMARY KEY (id)
    , CONSTRAINT "fk_venue_image" FOREIGN KEY (id_image) REFERENCES image (id) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE venue_image (
      id                serial NOT NULL
    , id_venue          integer NOT NULL
    , id_image          integer NOT NULL
    , CONSTRAINT "pk_venue_image" PRIMARY KEY (id)
    , CONSTRAINT "unique_venue_image_venue_image" UNIQUE (id_venue, id_image)
    , CONSTRAINT "fk_venue_image_venue" FOREIGN KEY (id_venue) REFERENCES venue (id) MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE
    , CONSTRAINT "fk_venue_image_image" FOREIGN KEY (id_image) REFERENCES image (id) MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE
);



CREATE TABLE event (
      id                serial NOT NULL
    , id_venue          integer NOT NULL
    , title             character varying(200) NOT NULL
    , startdate         timestamp without time zone NOT NULL
    , enddate           timestamp without time zone
    , canceled          boolean
    , created           timestamp without time zone
    , updated           timestamp without time zone
    , deleted           timestamp without time zone
    , CONSTRAINT "pk_event" PRIMARY KEY (id)
    , CONSTRAINT "fk_event_venue" FOREIGN KEY (id_venue) REFERENCES venue (id) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT
);