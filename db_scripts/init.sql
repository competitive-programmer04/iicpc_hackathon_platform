create table if not exists metrics_trading_engine(
    id serial,
    submission_id varchar(50) not null,
    recorded_at timestamptz not null,
    time_second int not null,
    tps int,
    p50_lat float,
    p99_lat float,
    accuracy float,
    primary key (id,recorded_at)
);

select create_hypertable('metrics_trading_engine','recorded_at', if_not_exists => TRUE);

create table if not exists submissions(
    id serial primary key,
    team_id varchar(30),
    submission_id varchar(50)
);