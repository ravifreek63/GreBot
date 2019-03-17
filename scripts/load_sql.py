import csv
import mysql.connector

mydb = mysql.connector.connect(host='localhost',
    user='root',
    passwd='rootpass',
    db='gre_records')
cursor = mydb.cursor()

def process(word):
  word_cl = word.replace('"', '')
  return word_cl

csv_data = csv.reader(file('data.csv'))
for row in csv_data:
    sql = "INSERT INTO word_list (word, meaning) VALUES (%s, %s)"
    val = (process(row[1]), process(row[2]))
    cursor.execute(sql, val)

#close the connection to the database.
mydb.commit()
cursor.close()
print "Done"

