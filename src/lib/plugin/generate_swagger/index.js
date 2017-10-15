'use strict';

/**
 * @file API plugin generate-swagger
 * @author Yourtion Guo <yourtion@gmail.com>
 */

const fs = require('fs');
const path = require('path');

module.exports = function generateSwagger(data, dir) {

  const result = {
    swagger: '2.0',
    info: {
      title: data.info.title,
      description: data.info.description,
      version: data.info.version || '1.0.0',
      // termsOfService: 'http://swagger.io/terms/',
      // contact: {
      //   email: 'yourtion@gmail.com',
      // },
      // license: {
      //   name: 'Apache 2.0',
      //   url: 'http://www.apache.org/licenses/LICENSE-2.0.html',
      // },
    },
    host: data.info.host.replace('http://', '').replace('https://', ''),
    basePath: data.info.basePath,
    schemes: [ 'http' ],
    tags: [],
    definitions: {},
  };

  for(const k in data.group) {
    result.tags.push({ name: k, description: data.group[k] });
  }
  result.tags = result.tags.sort((a, b) => a.name > b.name ? 1 : -1);

  const paths = result.paths = {};
  for (const key in data.schemas) {
    const schema = data.schemas[key];
    const pathArray = [];
    for(const p of schema.path.split('/')) {
      if(p.indexOf(':') === 0) {
        pathArray.push(`{${ p.substr(1, p.length) }}`);
      } else {
        pathArray.push(p);
      }
    }
    const newPath = pathArray.join('/');
    if(!paths[newPath]) paths[newPath] = {};
    const sc = paths[newPath];
    sc[schema.method] = {
      tags: [ schema.group ],
      summary: schema.title,
      description: schema.description || '',
      consumes: [
        'application/json',
      ],
      produces: [
        'application/json',
      ],
      responses: {
        200: {
          description: '请求成功',
        },
      },
    };

    sc[schema.method].parameters = [];
    const bodySchema = {};
    let example = schema.examples && schema.examples[0];
    if (schema.examples && schema.examples.length > 1) {
      for(const item of schema.examples) {
        if(item.output.success) {
          example = item;
          break;
        }
      }
    }
    example = example || { input: {}, output: {}};
    for(const place of [ 'params', 'query', 'body' ]) {
      for(const key in schema[place]) {
        const obj = {
          name: key,
          in: place === 'params' ? 'path' : place,
          description: schema[place][key].comment,
          type: schema[place][key].type.toLowerCase(),
          required: schema[place][key].required,
          example: example.input[key],
        };
        if(schema.required.has(key)) obj.required = true;
        if(schema[place][key].type === 'ENUM') {
          obj.type = 'string';
          obj.enum = schema[place][key].params;
        }
        if(schema[place][key].type === 'IntArray') {
          obj.type = 'array';
          obj.items = { type: 'integer' };
        }
        if(schema[place][key].type === 'Date') {
          obj.type = 'string';
          obj.format = 'date';
        }
        if(place === 'body'){
          delete obj.in;
          delete obj.name;
          delete obj.required;
          bodySchema[key] = obj;
        }else {
          sc[schema.method].parameters.push(obj);
        }
      }
    }
    sc[schema.method].responses[200]['example'] = example.output;
    if(schema.method === 'post' && schema.body) {
      const required = schema.required && [ ...schema.required ].filter(it => Object.keys(bodySchema).indexOf(it) > -1);
      sc[schema.method].parameters.push({
        in: 'body',
        name: 'body',
        description: '请求体',
        required: true,
        schema: {
          type: 'object',
          required,
          properties: bodySchema,
        },
      });
    }
  }
  
  fs.writeFileSync(path.resolve(dir, 'swagger.json'), JSON.stringify(result, 2, '  '));
};
