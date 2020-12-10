import os
import math
import json
import boto3
import string
import hashlib
import functools


default_alphabet = list(string.ascii_lowercase + string.ascii_uppercase + string.digits)


def strtoint(string, alphabet):
    return functools.reduce(lambda acc, ind: (acc * len(alphabet)) + (ind + 1), map(alphabet.index, list(string)), 0)


def inttostr(value, alphabet):
    chars = []

    while value > 0:
        value, mod = divmod(value, len(alphabet))
        chars.append(alphabet[mod - 1])

    return ''.join(reversed(chars))

def md5_brute_force(start, end, hex_md5, alphabet):
    value = start

    while value < end:

        if value % 100000 == 0:
            print(value, end, (value - start) / (end - start))

        string = inttostr(value, alphabet)

        if hashlib.md5(string.encode()).hexdigest() == hex_md5:
            return string

        value += 1

    return None


def get_env_inputs():
    array_index = os.environ.get('AWS_BATCH_JOB_ARRAY_INDEX', None)
    dynamo_table = os.environ.get('DYNAMO_TABLE', None)

    jobs_count = os.environ.get('jobsCount', None)
    json_md5 = os.environ.get('jsonMD5', None)

    assert(array_index is not None)
    assert(dynamo_table is not None)

    assert(jobs_count is not None)
    assert(json_md5 is not None)


    array_index = int(array_index)
    jobs_count = int(jobs_count)

    return (array_index, dynamo_table, jobs_count, json_md5)


def get_input(dynamo_table, json_md5):
    dynamo = boto3.client('dynamodb')
    item = dynamo.get_item(
        TableName=dynamo_table,
        Key={
            'ID': {'S': json_md5}
        }
    )

    return json.loads(item['Item']['input']['S'])


def calculate_local(min_length, max_length, array_index, jobs_count, alphabet):
    global_start = alphabet[0] * int(min_length)
    global_end = alphabet[-1] * int(max_length)

    int_start = strtoint(global_start, alphabet)
    int_end = strtoint(global_end, alphabet)

    step = math.ceil((int_end - int_start) / jobs_count)

    local_start = min(int_start + (step * array_index), int_end)
    local_end   = min(int_start + (step * (array_index + 1)), int_end)

    print(local_start, local_end, local_end - local_start)

    return local_start, local_end

def save_result(dynamo_table, json_md5, result):
    print(result)
    dynamo = boto3.client('dynamodb')

    dynamo.update_item(
        TableName=dynamo_table,
        Key={
            'ID': {'S': json_md5}
        },
        UpdateExpression='SET password = :password',
        ExpressionAttributeValues= {
            ':password': {'S': result},
        }
    )


def batch_main():
    array_index, dynamo_table, jobs_count, json_md5 = get_env_inputs()
    input = get_input(dynamo_table, json_md5)

    alphabet = input.get('alphabet', None) or default_alphabet

    local_start, local_end = calculate_local(input['minLength'], input['maxLength'], array_index, jobs_count, alphabet)

    result = md5_brute_force(local_start, local_end, input['md5'], alphabet)
    if result is not None:
        save_result(dynamo_table, json_md5, result)


if __name__ == "__main__":
    try:
        batch_main()
    except:
        import traceback
        traceback.print_exc()
        raise
