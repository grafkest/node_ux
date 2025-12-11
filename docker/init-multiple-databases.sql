CREATE DATABASE graph_db;
CREATE DATABASE initiatives_db;
CREATE DATABASE workforce_db;
CREATE DATABASE auth_db;

\connect graph_db
CREATE SCHEMA IF NOT EXISTS graph;

\connect initiatives_db
CREATE SCHEMA IF NOT EXISTS initiatives;

\connect workforce_db
CREATE SCHEMA IF NOT EXISTS workforce;

\connect auth_db
CREATE SCHEMA IF NOT EXISTS auth;
