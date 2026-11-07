CREATE TABLE tt_content ( vee_items int unsigned DEFAULT 0 NOT NULL, vee_shared int unsigned DEFAULT 0 NOT NULL, tx_container_parent int unsigned DEFAULT 0 NOT NULL );
CREATE TABLE tx_vee_item (
 uid int unsigned auto_increment PRIMARY KEY, pid int DEFAULT 0 NOT NULL,
 title varchar(255) DEFAULT '' NOT NULL, owner int DEFAULT 0 NOT NULL,
 owner_table varchar(255) DEFAULT '' NOT NULL, slot varchar(255) DEFAULT '' NOT NULL,
 sorting int DEFAULT 0 NOT NULL, hidden smallint DEFAULT 0 NOT NULL,
 deleted smallint DEFAULT 0 NOT NULL, tstamp int DEFAULT 0 NOT NULL,
 crdate int DEFAULT 0 NOT NULL, lang int DEFAULT 0 NOT NULL,
 origin int DEFAULT 0 NOT NULL, nested int DEFAULT 0 NOT NULL,
 choice varchar(50) DEFAULT '' NOT NULL, dependent varchar(50) DEFAULT '' NOT NULL
);
