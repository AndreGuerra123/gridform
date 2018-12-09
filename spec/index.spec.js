var gridform = require('../lib');
var formidable = require('formidable');
var mongo = require('mongodb');
var expect = require('chai').expect
var express = require('express')
var router = require('express-promise-router')();
var request = require('request-promise');
var fs = require('fs')
var mc;
var db;

describe('gridform', function () {
  beforeAll(function (done) {
    //Start testing server
    //parse form field
    var parsefields = function (req, res, next) {
      var form = gridform({
        db: db,
        mongo: mongo
      });
      form.parse(req, function (err, fields, files) {
        if (err) res.status(400).send(err)
        else res.status(200).send(fields)
      });
      next()
    }

    //store file and return generated doc
    var storefiles = function (req, res, next) {
      var form = gridform({
        db: db,
        mongo: mongo
      });
      form.parse(req, function (err, fields, files) {
        if (err) res.status(400).send(err)
        else {
          db.collection('fs.files', function (err, coll) {
            if (err) res.status(400).send(err)
            coll.find({
              _id: {
                $in: Object.values(files).map(e => e.id)
              }
            }).toArray(function (err, items) {
              if (err) res.status(400).send(err)
              res.status(200).send(items)
              next()
            })
          })
        }
      });
    }

    //store file name as metadata
    var storemeta = function (req, res, next) {
      var form = gridform({
        db: db,
        mongo: mongo
      });
      form.on('fileBegin', function (name, file) {
        file.metadata = {
          name
        };
      });
      form.parse(req, function (err, fields, files) {
        if (err) res.status(400).send(err)
        else {
          db.collection('fs.files', function (err, coll) {
            if (err) res.status(400).send(err)
            coll.find({
              _id: {
                $in: Object.values(files).map(e => e.id)
              }
            }).toArray(function (err, items) {
              if (err) res.status(400).send(err)
              res.status(200).send(items)
              next()
            })
          })
        }
      });
    }

    var everything = function (req, res, next) {
      var form = gridform({
        db: db,
        mongo: mongo
      });
      form.on('fileBegin', function (name, file) {
        file.metadata = {
          name
        };
      });
      form.parse(req, function (err, fields, files) {
        if (err) res.status(400).send(err)
        else {
          db.collection('fs.files', function (err, coll) {
            if (err) res.status(400).send(err)
            coll.find({
              _id: {
                $in: Object.values(files).map(e => e.id)
              }
            }).toArray(function (err, items) {
              if (err) res.status(400).send(err)
              res.status(200).send({
                fields,
                files: items
              })
              next()
            })
          })
        }
      });
    }

    router.route('/parsefields').post(parsefields)
    router.route('/storefiles').post(storefiles)
    router.route('/storemeta').post(storemeta)
    router.route('/everything').post(everything)

    //start server
    var app = express()
    app.use('/', router)
    app.listen(4000, function (err) {
      if (err) done(err);
      mongo.MongoClient.connect('mongodb://localhost:27017', function (err, client) {
        if (err) done(err)
        mc = client;
        db = mc.db('test');
        done()
      });
    })

  });

  afterAll(done => {
    db.dropDatabase((err) => {
      if (err) done(err)
      else mc.close(done)
    })

  });

  describe('File', function () {
    it('should be a function.', function () {
      expect(gridform.File).to.be.a('function')
    });
    it('should have expected properties.', function () {
      expect(new gridform.File).to.contain.keys('name', 'path', 'type', 'size', 'root', 'id', 'lastModified')
    });
  });

  describe('gridfsStream', function () {
    it('should be an exposed function.', function () {
      expect(gridform.gridfsStream).to.been.a('function');
    })
  })

  describe('gridform object', function () {
    it('should be a function.', function () {
      expect(gridform).to.be.a('function');
    })
    describe('should be an instance that', function () {
      it('require the db argument..', function () {
        expect(() => {
          gridform()
        }).to.throw()
        expect(() => {
          gridform({
            mongo
          })
        }).to.throw()
        expect(() => {
          gridform({
            db: null,
            mongo
          })
        }).to.throw()
      })
      it('require the driver argument', function () {
        expect(() => {
          gridform()
        }).to.throw()
        expect(() => {
          gridform({
            db
          })
        }).to.throw()
        expect(() => {
          gridform({
            db,
            mongo: null
          })
        }).to.throw()
      })
      it('is of type formidable.IncomingForm.', function () {
        var form = gridform({
          db: db,
          mongo: mongo
        });
        expect(form).to.be.instanceOf(formidable.IncomingForm)
      })
      describe('gridform options', function () {
        it('should not assign db, filename, or mongo to the form itself.', function () {
          var form = gridform({
            db: 1,
            mongo: mongo,
            filename: function () {},
            x: true
          });
          expect(form.x).not.to.exist
          expect(form.db).not.to.exist
          expect(form.mongo).not.to.exist
          expect(form.filename).not.to.exist
        })
        it('have a user mutable __filename function.', function () {
          var form = gridform({
            db: db,
            mongo: mongo
          });
          expect(form.__filename).to.be.a('function')
          expect(form.__filename(4)).to.equal(4)

          form = gridform({
            db: db,
            mongo: mongo,
            filename: function () {
              return 2
            }
          });
          expect(form.__filename(4)).to.equal(2)
        });
      })

      // test uploading a file and getting fields, files, progress, final values
      describe('handle uploading of multipart forms', function () {

        it('by parsing a form field of a simple form.', function (done) {

          var options = {
            method: 'POST',
            uri: 'http://localhost:4000/parsefields',
            form: {
              key: 'value'
            },
            json: true
          };

          request(options).then(function (body) {
            expect(body.key).to.equal('value')
            done()
          }).catch(err => {
            done(err)
          })


        });
        it('by parsing multiple fields of a simple form.', function (done) {
          var options = {
            method: 'POST',
            uri: 'http://localhost:4000/parsefields',
            form: {
              key: 'value',
              key2: 'value2'
            },
            json: true
          };

          request(options).then(function (body) {
            expect(body.key).to.equal('value')
            expect(body.key2).to.equal('value2')
            done()
          }).catch(err => {
            done(err)
          })
        });
        it('by supporting automatic file storing.', function (done) {

          var options = {
            method: 'POST',
            uri: 'http://localhost:4000/storefiles',
            formData: {
              file: {
                value: fs.createReadStream('./spec/test.png'),
                options: {
                  filename: 'test.png',
                  contentType: 'image/png'
                }
              }
            },
            json: true
          };

          request(options).then(function (body) {
            expect(body[0]._id).to.exist
            expect(body[0].filename).to.equals('test.png')
            expect(body[0].contentType).to.equals('image/png')
            done()
          }).catch(err => {
            done(err)
          })

        });
        it('by supporting automatic metadata storing.', function (done) {

          var options = {
            method: 'POST',
            uri: 'http://localhost:4000/storemeta',
            formData: {
              file: { // 'File is the name of the file
                value: fs.createReadStream('./spec/test.png'),
                options: {
                  filename: 'test.png',
                  contentType: 'image/png'
                }
              }
            },
            json: true
          };

          request(options).then(function (body) {
            expect(body[0].metadata.name).to.equal('file')
            done()
          }).catch(err => {
            done(err)
          })

        });
        it('by supporting multiple files storing (even with same filename).', function (done) {
          var options = {
            method: 'POST',
            uri: 'http://localhost:4000/storefiles',
            formData: {
              file: {
                value: fs.createReadStream('./spec/test.png'),
                options: {
                  filename: 'test.png',
                  contentType: 'image/png'
                }
              },
              file2: {
                value: fs.createReadStream('./spec/test.png'),
                options: {
                  filename: 'test.png',
                  contentType: 'image/png'
                }
              }
            },
            json: true
          };

          request(options).then(function (body) {
            expect(body[0].filename).to.equals('test.png')
            expect(body[1].filename).to.equals('test.png')
            done()
          }).catch(err => {
            done(err)
          })
        });
        it('by achieving all of above at once.', function (done) {
          var options = {
            method: 'POST',
            uri: 'http://localhost:4000/everything',
            formData: {
              key: 'value',
              file: {
                value: fs.createReadStream('./spec/test.png'),
                options: {
                  filename: 'test.png',
                  contentType: 'image/png'
                }
              },
              file1: {
                value: fs.createReadStream('./spec/test.png'),
                options: {
                  filename: 'test.png',
                  contentType: 'image/png'
                }
              },
              file2: {
                value: fs.createReadStream('./spec/test2.png'),
                options: {
                  filename: 'test2.png',
                  contentType: 'image/png'
                }
              }
            },
            json: true
          };

          request(options).then(function (body) {
            expect(body.fields.key).to.equal('value')

            expect(body.files[0].filename).to.equal('test.png')
            expect(body.files[0].metadata.name).to.equal('file')

            expect(body.files[1].filename).to.equal('test.png')
            expect(body.files[1].metadata.name).to.equal('file1')

            expect(body.files[2].filename).to.equal('test2.png')
            expect(body.files[2].metadata.name).to.equal('file2')

            done()
          }).catch(err => {
            done(err)
          })
        });
      })
    })
  })
})