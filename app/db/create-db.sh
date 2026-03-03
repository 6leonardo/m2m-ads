#!/bin/bash
#docker exec -it postgres psql -U admin -d postgres -c "CREATE DATABASE m2m_dev;"
docker exec -i postgres psql -U admin -d m2m_dev < schema.1.sql

