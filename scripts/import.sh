#!/bin/bash

while IFS=, read column1 column2 column3
      do
        column2  $column2 | sed 's/"//g'
        # echo "INSERT INTO word_list (word, meaning) VALUES ('$column2', '$column3');"

done < data.csv #| mysql -u root -p gre_records;
