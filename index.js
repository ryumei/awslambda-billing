var aws   = require('aws-sdk');
var lambda = new aws.Lambda({apiVersion: '2015-03-31'});
var cw    = new aws.CloudWatch({region: 'ap-northeast-1', endpoint: 'https://monitoring.ap-northeast-1.amazonaws.com'});

var postFunctionName = process.env.POST_FUNCTION_NAME;

var serviceNames = ['AmazonEC2', 'AmazonRDS', 'AmazonRoute53', 'AmazonS3', 'AmazonSNS', 'AWSDataTransfer', 'AWSLambda', 'AWSQueueService', 'AWSConfig'];

var floatFormat = function(number, n) {
    var _pow = Math.pow(10 , n) ;
    return Math.round(number * _pow)  / _pow;
}

var postToSlack = function(billings, context) {
    var fields = [];
    for (var serviceName in billings) {
        fields.push({
            title: serviceName,
            value: floatFormat(billings[serviceName], 2) + " USD",
            short: true
        });
    }
    var message = {
        channel: channel_name,
        attachments: [{
            fallback: '今月の AWS の利用費は、' + floatFormat(billings['Total'], 2) + ' USDです。',
            pretext: '今月の AWS の利用費は…',
            color: 'good',
            fields: fields
        }]
    };
    
    var awParam = {
        FunctionName: postFunctionName,
        InvokeArgs: '{ "payload":"' + new Buffer('{ "data1": "ほげ", "data2": "ふが" }').toString('base64') + '"}'
    };
    lambda.invokeAsync(awParam, function(err, data) {
    if(err) {
        console.log(err + err.stack);
    }
    else {
        console.log(data);
    });
}

var getBilling = function(context) {
    var now = new Date();
    var startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1,  0,  0,  0);
    var endTime   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);

    var billings = {};

    var total_params = {
        MetricName: 'EstimatedCharges',
        Namespace: 'AWS/Billing',
        Period: 86400,
        StartTime: startTime,
        EndTime: endTime,
        Statistics: ['Average'],
        Dimensions: [
            {
                Name: 'Currency',
                Value: 'USD'
            }
        ]
    };

    cw.getMetricStatistics(total_params, function(err, data) {
        if (err) {
            console.error(err, err.stack);
        } else {
            var datapoints = data['Datapoints'];
            if (datapoints.length < 1) {
                billings['Total'] = 0;
            } else {
                billings['Total'] = datapoints[datapoints.length - 1]['Average']
            }
            if (serviceNames.length > 0) {
                serviceName = serviceNames.shift();
                getEachServiceBilling(serviceName);
            }
        }
    });

    var getEachServiceBilling = function(serviceName) {
        var params = {
            MetricName: 'EstimatedCharges',
            Namespace: 'AWS/Billing',
            Period: 86400,
            StartTime: startTime,
            EndTime: endTime,
            Statistics: ['Average'],
            Dimensions: [
                {
                    Name: 'Currency',
                    Value: 'USD'
                },
                {
                    Name: 'ServiceName',
                    Value: serviceName
                }
            ]
        };
        cw.getMetricStatistics(params, function(err, data) {
            if (err) {
                console.error(err, err.stack);
            } else {
                var datapoints = data['Datapoints'];
                if (datapoints.length < 1) {
                    billings[serviceName] = 0;
                } else {
                    billings[serviceName] = datapoints[datapoints.length - 1]['Average']
                }
                if (serviceNames.length > 0) {
                    serviceName = serviceNames.shift();
                    getEachServiceBilling(serviceName);
                } else {
                    //TODO formatting billing data
                    postToSlack(billings, context)
                }
            }
        });
    }
}

exports.handler = function(event, context, callback) {
    getBilling(context);
}
